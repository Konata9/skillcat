/**
 * `SkillManager` is the core facade: it owns config, the sidecar stores, the
 * scan state and the analysis findings, and exposes operations (refresh,
 * project registry, annotations, remote search, CLI ops) to any UI.
 *
 * UI-agnostic: listeners receive change notifications, never rendered strings.
 *
 * The facade only orchestrates. Configuration/project mutations live in
 * `manager/settings.ts`, the LLM review pipeline in `manager/evaluation.ts`,
 * and the diagnostic report in `manager/doctor.ts`.
 */
import { basename } from 'node:path';
import { resolveSkillsCommand, type BundledCli, type ResolvedCommand } from './cli/env.js';
import { buildProxyEnv } from './cli/proxy.js';
import {
  fetchLeaderboardApi,
  fetchRemoteSkillDetail,
  searchRemoteApi,
  searchRemoteViaCli,
  type FetchLike,
} from './cli/remote-search.js';
import { runAdd, runInit, runRemove, runUpdate } from './cli/operations.js';
import { SkillsCli } from './cli/skills-cli.js';
import { ConfigStore } from './config.js';
import { getLogger } from './logger.js';
import { analyzeSkills } from './analysis.js';
import { toErrorMessage } from './coerce.js';
import { BridgeService } from './bridge/service.js';
import { scanAll } from './scan.js';
import { evaluationSignature, type ModelCaller } from './evaluation/evaluate.js';
import { applyVerdicts } from './evaluation/verdicts.js';
import { annotationKey, recordKey } from './keys.js';
import { testLlmConnection, type LlmTestResult } from './llm.js';
import { getConfigDir } from './paths.js';
import { discoverProjects } from './projects.js';
import { SidecarStore } from './sidecar.js';
import { checkForUpdate, type UpdateCheckResult } from './update.js';
import { DoctorService } from './manager/doctor.js';
import { EvaluationController } from './manager/evaluation.js';
import { OptimizationController } from './manager/optimization.js';
import { SettingsController } from './manager/settings.js';
import { createManagerState, type ManagerState, type RefreshOptions } from './manager/state.js';
import type {
  ActivitySettings,
  ActivityStats,
  AddTarget,
  Annotation,
  AppConfig,
  AsyncOp,
  BridgeStatus,
  EvaluationEvent,
  EvaluationLocale,
  LeaderboardKind,
  LlmSettings,
  LoggingSettings,
  ProjectInfo,
  ProxySettings,
  RemoteSkill,
  RemoteSkillDetail,
  RuntimeSkillEvent,
  Scope,
  SkillOptimization,
  SkillRecord,
} from './types.js';

export type { ManagerState, RefreshOptions };

export class SkillManager {
  readonly configStore: ConfigStore;
  readonly sidecar: SidecarStore;
  readonly bridge: BridgeService;
  readonly state: ManagerState = createManagerState();

  private readonly settingsController: SettingsController;
  private readonly evaluationController: EvaluationController;
  private readonly optimizationController: OptimizationController;
  private readonly doctorService: DoctorService;

  private resolved: ResolvedCommand | null = null;
  private cli: SkillsCli | null = null;
  private listeners = new Set<() => void>();
  private evaluationListeners = new Set<(event: EvaluationEvent) => void>();
  private activityListeners = new Set<(events: RuntimeSkillEvent[]) => void>();
  private copyHashCache = new Map<string, string>();
  private remoteFetch: FetchLike | null = null;
  private readonly bundledCli: BundledCli | undefined;
  private readonly builtinSkillsDir: string | undefined;

  constructor(options: {
    configDir?: string;
    bundledCli?: BundledCli;
    builtinSkillsDir?: string;
    modelCaller?: ModelCaller;
  } = {}) {
    const dir = options.configDir ?? getConfigDir();
    this.configStore = new ConfigStore(dir);
    this.sidecar = new SidecarStore(dir);
    this.bridge = new BridgeService({ configDir: dir });
    this.bundledCli = options.bundledCli;
    this.builtinSkillsDir = options.builtinSkillsDir;

    this.settingsController = new SettingsController({
      configStore: this.configStore,
      bridge: this.bridge,
      state: this.state,
      resolveCli: () => this.resolveCli(),
      emit: () => this.emit(),
    });
    this.evaluationController = new EvaluationController({
      configStore: this.configStore,
      sidecar: this.sidecar,
      state: this.state,
      modelCaller: options.modelCaller,
      remoteFetch: () => this.remoteFetch,
      allRecords: () => this.allRecords(),
      emit: () => this.emit(),
      emitEvaluation: (event) => this.emitEvaluation(event),
      currentSignature: () => this.currentSignature(),
      rebuildFindings: () => this.rebuildFindings(),
    });
    this.doctorService = new DoctorService({
      configStore: this.configStore,
      cli: () => this.cli,
      resolved: () => this.resolved,
    });
    this.optimizationController = new OptimizationController({
      configStore: this.configStore,
      sidecar: this.sidecar,
      state: this.state,
      modelCaller: options.modelCaller,
      remoteFetch: () => this.remoteFetch,
      builtinSkillsDir: this.builtinSkillsDir,
      emit: () => this.emit(),
    });

    this.bridge.onActivity((events) => {
      this.emit();
      for (const listener of this.activityListeners) listener(events);
    });
  }

  async init(): Promise<void> {
    const logger = getLogger();
    logger.info('initializing', { configDir: this.configStore.dir });
    await this.configStore.load();
    await this.resolveCli();
    const store = await this.sidecar.loadEvaluation();
    this.state.evaluation = store?.report ?? null;
    this.state.verdicts = store?.verdicts ?? [];
    this.state.verdictsAt = store?.verdictsAt ?? null;
    this.state.verdictsSignature = store?.verdictsSignature ?? null;
    // Persisted optimization results are restored so a restart never forces a
    // fresh (token-billed) run; only an explicit regenerate replaces them.
    const optimizer = await this.sidecar.loadOptimizer();
    this.state.optimizations = new Map(Object.entries(optimizer));
    this.bridge.setActivitySettings(this.configStore.value.activity);
    await this.bridge.load();
    this.bridge.startWatching();
    logger.info('initialized');
  }

  /** Persists diagnostic-log preferences; the host applies them to its logger. */
  setLogging(settings: LoggingSettings): Promise<void> {
    return this.settingsController.setLogging(settings);
  }

  /** Guarantees `config.json` exists and returns its path (for open / reveal). */
  async ensureConfigFile(): Promise<string> {
    await this.configStore.ensureFile();
    return this.configStore.filePath;
  }

  /** Re-reads `config.json` after an external edit and rescans everything. */
  async reloadConfig(): Promise<void> {
    getLogger().info('config reload requested');
    await this.configStore.load();
    await this.resolveCli();
    await this.refresh();
  }

  get config(): AppConfig {
    return this.configStore.value;
  }

  get cliInfo(): ResolvedCommand | null {
    return this.resolved;
  }

  get cliAvailable(): boolean {
    return this.cli !== null;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Subscribes to the transient evaluation process log (never persisted). */
  onEvaluationEvent(listener: (event: EvaluationEvent) => void): () => void {
    this.evaluationListeners.add(listener);
    return () => {
      this.evaluationListeners.delete(listener);
    };
  }

  private emitEvaluation(event: EvaluationEvent): void {
    for (const listener of this.evaluationListeners) listener(event);
  }

  /** Subscribes to freshly ingested trigger events (also persisted). */
  onActivityEvent(listener: (events: RuntimeSkillEvent[]) => void): () => void {
    this.activityListeners.add(listener);
    return () => {
      this.activityListeners.delete(listener);
    };
  }

  listBridges(): Promise<BridgeStatus[]> {
    return this.bridge.statuses();
  }

  async installBridge(id: string): Promise<void> {
    getLogger().info('bridge install requested', { id });
    await this.bridge.install(id);
    this.emit();
  }

  async uninstallBridge(id: string): Promise<void> {
    getLogger().info('bridge uninstall requested', { id });
    await this.bridge.uninstall(id);
    this.emit();
  }

  activityEvents(): RuntimeSkillEvent[] {
    return this.bridge.activityEvents();
  }

  activityStats(): ActivityStats {
    return this.bridge.activityStats();
  }

  activityCounts(): Record<string, number> {
    return this.bridge.activityCounts();
  }

  async clearActivity(): Promise<void> {
    await this.bridge.clearActivity();
    this.emit();
  }

  private async resolveCli(): Promise<void> {
    this.resolved = await resolveSkillsCommand(this.configStore.value.skillsCommand, {
      bundled: this.bundledCli,
    });
    if (this.resolved.command) {
      getLogger().info('skills CLI resolved', {
        command: this.resolved.command,
        source: this.resolved.source,
      });
    } else {
      getLogger().warn('skills CLI unavailable', { error: this.resolved.error ?? 'unknown' });
    }
    this.cli = this.resolved.command
      ? new SkillsCli(this.resolved.command, {
          // Resolved env (PATH from a login shell) first, so the proxy vars
          // cannot clobber it; the proxy vars never touch PATH anyway.
          env: { ...this.resolved.env, ...buildProxyEnv(this.configStore.value.proxy) },
        })
      : null;
  }

  /**
   * Host-supplied transport for the in-process search request. Electron main
   * injects a `net.fetch` bound to a session with the proxy configured, because
   * Node's global fetch ignores proxy env vars set after process start.
   */
  setRemoteFetch(fetchImpl: FetchLike | null): void {
    this.remoteFetch = fetchImpl;
    this.emit();
  }

  async refresh(options: RefreshOptions = {}): Promise<void> {
    const logger = getLogger();
    logger.debug('scan started', { deep: options.deep === true });
    this.state.loading = true;
    this.emit();
    try {
      const config = this.configStore.value;
      const annotations = await this.sidecar.loadAnnotations();
      const savedState = await this.sidecar.loadState();
      this.copyHashCache.clear();

      const scan = await scanAll({
        cli: this.cli,
        annotations,
        showInternal: config.showInternal,
        roots: config.roots,
        maxDepth: config.maxScanDepth,
        customSkillDirs: config.customSkillDirs,
        registeredProjects: config.projects.map((entry) => entry.path),
        extraProjectPaths: options.projectPaths,
        deep: options.deep,
        copyHashCache: this.copyHashCache,
        builtinSkillsDir: this.builtinSkillsDir,
      });
      const allRecords = scan.all;

      this.state.global = scan.global;
      this.state.projects = scan.projects;
      this.state.orphans = scan.orphans;
      this.state.projectErrors = scan.errors;
      this.state.baseFindings = analyzeSkills({
        records: allRecords,
        orphans: scan.orphans,
        lastSeen: savedState.hashes,
        thresholds: config.thresholds,
      });
      this.state.findings = applyVerdicts(this.state.baseFindings, this.state.verdicts);

      const hashes: Record<string, string> = {};
      for (const record of allRecords) hashes[recordKey(record)] = record.contentHash;
      await this.sidecar.saveState({ hashes });

      this.bridge.setActivitySettings(config.activity);
      this.bridge.setCatalog(allRecords);
      await this.bridge.ingest();

      this.state.scannedAt = new Date().toISOString();
      logger.info('scan finished', {
        global: this.state.global.length,
        projects: this.state.projects.size,
        findings: this.state.findings.length,
        errors: this.state.projectErrors.size,
      });
    } catch (error) {
      logger.error('scan failed', toErrorMessage(error));
      throw error;
    } finally {
      this.state.loading = false;
      this.emit();
    }
  }

  allRecords(): SkillRecord[] {
    return [...this.state.global, ...[...this.state.projects.values()].flat()];
  }

  /** Current input fingerprint; `null` when there is nothing to evaluate. */
  private currentSignature(): string | null {
    const records = this.allRecords();
    if (records.length === 0) return null;
    return evaluationSignature(records, this.configStore.value.llm);
  }

  /** Whether the saved evaluation no longer matches the scanned skills. */
  evaluationStale(): boolean {
    return this.evaluationController.evaluationStale();
  }

  /** Whether the saved AI verdicts no longer match the scanned skills. */
  verdictsStale(): boolean {
    return this.evaluationController.verdictsStale();
  }

  /** Re-applies the saved verdicts to the current rule findings. */
  private rebuildFindings(): void {
    this.state.findings = applyVerdicts(this.state.baseFindings, this.state.verdicts);
  }

  findRecord(scope: Scope, projectPath: string | undefined, name: string): SkillRecord | undefined {
    if (scope === 'global') {
      return this.state.global.find((record) => record.name === name);
    }
    return this.state.projects.get(projectPath ?? '')?.find((record) => record.name === name);
  }

  async listProjectInfos(): Promise<ProjectInfo[]> {
    const config = this.configStore.value;
    const discovered = await discoverProjects(config.roots, {
      maxDepth: config.maxScanDepth,
      customSkillDirs: config.customSkillDirs,
    });
    const map = new Map<string, ProjectInfo>();
    for (const item of discovered) {
      map.set(item.path, {
        path: item.path,
        name: item.name,
        pinned: false,
        registered: false,
        discovered: true,
        markers: item.markers,
        skillCount: this.state.projects.get(item.path)?.length ?? item.skillCount,
      });
    }
    for (const entry of config.projects) {
      const existing = map.get(entry.path);
      if (existing) {
        existing.registered = true;
        existing.alias = entry.alias;
        existing.pinned = entry.pinned === true;
      } else {
        map.set(entry.path, {
          path: entry.path,
          name: entry.alias ?? basename(entry.path),
          alias: entry.alias,
          pinned: entry.pinned === true,
          registered: true,
          discovered: false,
          markers: [],
          skillCount: this.state.projects.get(entry.path)?.length ?? null,
          error: this.state.projectErrors.get(entry.path),
        });
      }
    }
    for (const [path, error] of this.state.projectErrors) {
      const info = map.get(path);
      if (info) info.error = error;
    }
    const recentIndex = new Map(config.recent.map((path, index) => [path, index]));
    return [...map.values()].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const ai = recentIndex.get(a.path) ?? Number.MAX_SAFE_INTEGER;
      const bi = recentIndex.get(b.path) ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  }

  addProject(path: string, options: { alias?: string; pinned?: boolean } = {}): Promise<void> {
    return this.settingsController.addProject(path, options);
  }

  removeProject(path: string): Promise<void> {
    return this.settingsController.removeProject(path);
  }

  setProjectPinned(path: string, pinned: boolean): Promise<void> {
    return this.settingsController.setProjectPinned(path, pinned);
  }

  setRoots(roots: string[]): Promise<void> {
    return this.settingsController.setRoots(roots);
  }

  setSkillsCommand(command: string[] | null): Promise<void> {
    return this.settingsController.setSkillsCommand(command);
  }

  setProxy(proxy: Partial<ProxySettings>): Promise<void> {
    return this.settingsController.setProxy(proxy);
  }

  setThresholds(thresholds: { overlap?: number; duplicate?: number }): Promise<void> {
    return this.settingsController.setThresholds(thresholds);
  }

  setShowInternal(showInternal: boolean): Promise<void> {
    return this.settingsController.setShowInternal(showInternal);
  }

  setLlm(llm: LlmSettings): Promise<void> {
    return this.settingsController.setLlm(llm);
  }

  setCustomSkillDirs(dirs: string[]): Promise<void> {
    return this.settingsController.setCustomSkillDirs(dirs);
  }

  setActivity(settings: ActivitySettings): Promise<void> {
    return this.settingsController.setActivity(settings);
  }

  async loadAnnotation(record: SkillRecord): Promise<Annotation | null> {
    const annotations = await this.sidecar.loadAnnotations();
    return annotations[annotationKey(record)] ?? null;
  }

  async saveAnnotation(record: SkillRecord, annotation: Annotation | null): Promise<void> {
    const annotations = await this.sidecar.loadAnnotations();
    const key = annotationKey(record);
    const meaningful =
      annotation &&
      (annotation.added.length > 0 || annotation.removed.length > 0 || Boolean(annotation.note));
    if (meaningful) annotations[key] = annotation!;
    else delete annotations[key];
    await this.sidecar.saveAnnotations(annotations);
    await this.refresh();
  }

  async searchRemote(query: string): Promise<RemoteSkill[]> {
    try {
      return await searchRemoteApi(query, undefined, this.remoteFetch ?? fetch);
    } catch {
      if (this.resolved?.command) {
        return searchRemoteViaCli(this.resolved.command, query);
      }
      return [];
    }
  }

  /** Fetches a skills.sh leaderboard page; the site has no CLI equivalent. */
  async fetchLeaderboard(kind: LeaderboardKind, page = 0): Promise<RemoteSkill[]> {
    return fetchLeaderboardApi(kind, page, this.remoteFetch ?? fetch);
  }

  /** Fetches a published skill's detail (SKILL.md + files) from skills.sh. */
  async getRemoteSkillDetail(slug: string): Promise<RemoteSkillDetail> {
    return fetchRemoteSkillDetail(slug, this.remoteFetch ?? fetch);
  }

  /** Probes the user-supplied LLM endpoint/key/model (proxy-aware). */
  async testLlm(settings: LlmSettings): Promise<LlmTestResult> {
    return testLlmConnection(settings, this.remoteFetch ?? fetch);
  }

  /**
   * Runs the LLM evaluation over every scanned skill and saves the report plus
   * the AI pair verdicts. Only called explicitly (button press).
   */
  runEvaluation(locale: EvaluationLocale): Promise<void> {
    return this.evaluationController.runEvaluation(locale);
  }

  /**
   * Reviews only the heuristic candidate pairs and updates the AI verdicts,
   * keeping the existing report. Backs the "review candidates" button.
   */
  runCandidateReview(locale: EvaluationLocale): Promise<void> {
    return this.evaluationController.runCandidateReview(locale);
  }

  /**
   * Produces read-only optimization suggestions for one skill using the
   * built-in optimizer rubric. Requires a configured model.
   */
  optimizeSkill(record: SkillRecord, locale: EvaluationLocale): Promise<SkillOptimization> {
    return this.optimizationController.optimizeSkill(record, locale);
  }

  /** Cached optimization result for a skill, or null. */
  optimizationFor(record: SkillRecord): SkillOptimization | null {
    return this.optimizationController.optimizationFor(record);
  }

  /** Whether the cached optimization no longer matches the skill or model. */
  optimizationStale(record: SkillRecord): boolean {
    return this.optimizationController.optimizationStale(record);
  }

  /** Checks the configured GitHub repo for a newer release (proxy-aware). */
  async checkUpdate(repo: string, currentVersion: string): Promise<UpdateCheckResult> {
    return checkForUpdate(repo, currentVersion, this.remoteFetch ?? fetch);
  }

  /**
   * Installs a skill into one or more targets. A single target maps to one CLI
   * run; multiple targets run sequentially inside one operation so the UI shows
   * a single stream and one final result.
   */
  runAdd(source: string, targets: AddTarget[]): AsyncOp {
    getLogger().info('install requested', {
      source,
      targets: targets.map((target) => target.scope),
    });
    return runAdd(this.ensureCli(), source, targets);
  }

  runRemove(name: string, options: { scope: Scope; cwd?: string }): AsyncOp {
    getLogger().info('remove requested', { name, scope: options.scope });
    return runRemove(this.ensureCli(), name, options);
  }

  runUpdate(names: string[], options: { scope: Scope; cwd?: string }): AsyncOp {
    getLogger().info('update requested', { count: names.length, scope: options.scope });
    return runUpdate(this.ensureCli(), names, options);
  }

  runInit(name: string | null, cwd: string): AsyncOp {
    return runInit(this.ensureCli(), name, cwd);
  }

  private ensureCli(): SkillsCli {
    if (!this.cli) {
      throw new Error(this.resolved?.error ?? 'skills CLI is not available; check settings');
    }
    return this.cli;
  }

  doctor() {
    return this.doctorService.report();
  }
}
