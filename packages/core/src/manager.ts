/**
 * `SkillManager` is the core facade: it owns config, the sidecar stores, the
 * scan state and the analysis findings, and exposes operations (refresh,
 * project registry, annotations, remote search, CLI ops) to any UI.
 *
 * UI-agnostic: listeners receive change notifications, never rendered strings.
 */
import { basename } from 'node:path';
import { resolveSkillsCommand, type ResolvedCommand } from './cli/env.js';
import { buildProxyEnv, isValidProxyUrl, normalizeProxyUrl } from './cli/proxy.js';
import {
  fetchLeaderboardApi,
  fetchRemoteSkillDetail,
  searchRemoteApi,
  searchRemoteViaCli,
  type FetchLike,
} from './cli/remote-search.js';
import { SkillsCli } from './cli/skills-cli.js';
import { ConfigStore, normalizeCustomSkillDirs, sanitizeLlm } from './config.js';
import { analyzeSkills } from './analysis.js';
import { readLock, scanScope } from './discovery.js';
import {
  evaluateSkills,
  evaluationSignature,
  reviewCandidatePairs,
  type EvaluationLocale,
} from './evaluation/evaluate.js';
import { applyVerdicts } from './evaluation/verdicts.js';
import { annotationKey, recordKey } from './keys.js';
import { isLlmConfigured, testLlmConnection, type LlmTestResult } from './llm.js';
import { getConfigDir, getGlobalLockPath, getProjectLockPath } from './paths.js';
import { discoverProjects } from './projects.js';
import { SidecarStore } from './sidecar.js';
import { checkForUpdate, type UpdateCheckResult } from './update.js';
import type {
  AddTarget,
  AiPairVerdict,
  Annotation,
  AppConfig,
  AsyncOp,
  DoctorReport,
  DoctorWarning,
  EvaluationEvent,
  EvaluationProgress,
  EvaluationReport,
  Finding,
  LeaderboardKind,
  LlmSettings,
  OpResult,
  OrphanLock,
  ProjectInfo,
  ProxySettings,
  RemoteSkill,
  RemoteSkillDetail,
  Scope,
  SkillRecord,
} from './types.js';

export interface ManagerState {
  loading: boolean;
  scannedAt: string | null;
  global: SkillRecord[];
  projects: Map<string, SkillRecord[]>;
  orphans: OrphanLock[];
  findings: Finding[];
  projectErrors: Map<string, string>;
  /** Rule-engine findings before AI verdicts are applied. */
  baseFindings: Finding[];
  /** Latest saved LLM evaluation, loaded from disk and refreshed on demand. */
  evaluation: EvaluationReport | null;
  verdicts: AiPairVerdict[];
  verdictsAt: string | null;
  verdictsSignature: string | null;
  evaluating: boolean;
  reviewing: boolean;
  evaluationProgress: EvaluationProgress | null;
  evaluationError: string | null;
}

export interface RefreshOptions {
  deep?: boolean;
  projectPaths?: string[];
}

export class SkillManager {
  readonly configStore: ConfigStore;
  readonly sidecar: SidecarStore;
  readonly state: ManagerState = {
    loading: false,
    scannedAt: null,
    global: [],
    projects: new Map(),
    orphans: [],
    findings: [],
    projectErrors: new Map(),
    baseFindings: [],
    evaluation: null,
    verdicts: [],
    verdictsAt: null,
    verdictsSignature: null,
    evaluating: false,
    reviewing: false,
    evaluationProgress: null,
    evaluationError: null,
  };

  private resolved: ResolvedCommand | null = null;
  private cli: SkillsCli | null = null;
  private listeners = new Set<() => void>();
  private evaluationListeners = new Set<(event: EvaluationEvent) => void>();
  private copyHashCache = new Map<string, string>();
  private remoteFetch: FetchLike | null = null;

  constructor(options: { configDir?: string } = {}) {
    const dir = options.configDir ?? getConfigDir();
    this.configStore = new ConfigStore(dir);
    this.sidecar = new SidecarStore(dir);
  }

  async init(): Promise<void> {
    await this.configStore.load();
    await this.resolveCli();
    const store = await this.sidecar.loadEvaluation();
    this.state.evaluation = store?.report ?? null;
    this.state.verdicts = store?.verdicts ?? [];
    this.state.verdictsAt = store?.verdictsAt ?? null;
    this.state.verdictsSignature = store?.verdictsSignature ?? null;
  }

  /** Guarantees `config.json` exists and returns its path (for open / reveal). */
  async ensureConfigFile(): Promise<string> {
    await this.configStore.ensureFile();
    return this.configStore.filePath;
  }

  /** Re-reads `config.json` after an external edit and rescans everything. */
  async reloadConfig(): Promise<void> {
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

  private async resolveCli(): Promise<void> {
    this.resolved = await resolveSkillsCommand(this.configStore.value.skillsCommand);
    this.cli = this.resolved.command
      ? new SkillsCli(this.resolved.command, {
          env: buildProxyEnv(this.configStore.value.proxy),
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
    this.state.loading = true;
    this.emit();
    try {
      const config = this.configStore.value;
      const annotations = await this.sidecar.loadAnnotations();
      const savedState = await this.sidecar.loadState();
      this.copyHashCache.clear();

      const globalScan = await scanScope({
        scope: 'global',
        cli: this.cli,
        annotations,
        showInternal: config.showInternal,
        deep: options.deep,
        copyHashCache: this.copyHashCache,
        customSkillDirs: config.customSkillDirs,
      });

      const discovered = await discoverProjects(config.roots, {
        maxDepth: config.maxScanDepth,
        customSkillDirs: config.customSkillDirs,
      });
      const projectPaths = new Set<string>([
        ...config.projects.map((entry) => entry.path),
        ...discovered.map((entry) => entry.path),
        ...(options.projectPaths ?? []),
      ]);

      const projects = new Map<string, SkillRecord[]>();
      const errors = new Map<string, string>();
      const orphans: OrphanLock[] = [...globalScan.orphans];

      for (const path of projectPaths) {
        try {
          const scan = await scanScope({
            scope: 'project',
            root: path,
            cli: this.cli,
            annotations,
            showInternal: config.showInternal,
            deep: false,
            copyHashCache: this.copyHashCache,
            customSkillDirs: config.customSkillDirs,
          });
          projects.set(path, scan.records);
          orphans.push(...scan.orphans);
          if (scan.error) errors.set(path, scan.error);
        } catch (error) {
          errors.set(path, error instanceof Error ? error.message : String(error));
        }
      }

      const allRecords = [...globalScan.records, ...[...projects.values()].flat()];

      this.state.global = globalScan.records;
      this.state.projects = projects;
      this.state.orphans = orphans;
      this.state.projectErrors = errors;
      this.state.baseFindings = analyzeSkills({
        records: allRecords,
        orphans,
        lastSeen: savedState.hashes,
        thresholds: config.thresholds,
      });
      this.state.findings = applyVerdicts(this.state.baseFindings, this.state.verdicts);

      const hashes: Record<string, string> = {};
      for (const record of allRecords) hashes[recordKey(record)] = record.contentHash;
      await this.sidecar.saveState({ hashes });

      this.state.scannedAt = new Date().toISOString();
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
    const report = this.state.evaluation;
    if (!report) return false;
    const signature = this.currentSignature();
    return signature !== null && signature !== report.signature;
  }

  /** Whether the saved AI verdicts no longer match the scanned skills. */
  verdictsStale(): boolean {
    if (this.state.verdicts.length === 0 || !this.state.verdictsSignature) return false;
    const signature = this.currentSignature();
    return signature !== null && signature !== this.state.verdictsSignature;
  }

  /** Re-applies the saved verdicts to the current rule findings. */
  private rebuildFindings(): void {
    this.state.findings = applyVerdicts(this.state.baseFindings, this.state.verdicts);
  }

  private async saveEvaluationStore(): Promise<void> {
    await this.sidecar.saveEvaluation({
      report: this.state.evaluation,
      verdicts: this.state.verdicts,
      verdictsAt: this.state.verdictsAt,
      verdictsSignature: this.state.verdictsSignature,
    });
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

  async addProject(path: string, options: { alias?: string; pinned?: boolean } = {}): Promise<void> {
    await this.configStore.update((config) => {
      const existing = config.projects.find((entry) => entry.path === path);
      if (existing) {
        if (options.alias !== undefined) existing.alias = options.alias;
        if (options.pinned !== undefined) existing.pinned = options.pinned;
      } else {
        config.projects.push({ path, alias: options.alias, pinned: options.pinned });
      }
      config.recent = [path, ...config.recent.filter((item) => item !== path)].slice(0, 20);
    });
    this.emit();
  }

  async removeProject(path: string): Promise<void> {
    await this.configStore.update((config) => {
      config.projects = config.projects.filter((entry) => entry.path !== path);
      config.recent = config.recent.filter((item) => item !== path);
    });
    this.state.projects.delete(path);
    this.emit();
  }

  async setProjectPinned(path: string, pinned: boolean): Promise<void> {
    await this.configStore.update((config) => {
      const existing = config.projects.find((entry) => entry.path === path);
      if (existing) existing.pinned = pinned;
      else config.projects.push({ path, pinned });
    });
    this.emit();
  }

  async setRoots(roots: string[]): Promise<void> {
    await this.configStore.update((config) => {
      config.roots = [...new Set(roots.filter(Boolean))];
    });
    this.emit();
  }

  async touchProject(path: string): Promise<void> {
    this.configStore.addRecent(path);
    await this.configStore.save();
  }

  async setSkillsCommand(command: string[] | null): Promise<void> {
    await this.configStore.update((config) => {
      config.skillsCommand = command;
    });
    await this.resolveCli();
    this.emit();
  }

  async setProxy(proxy: Partial<ProxySettings>): Promise<void> {
    await this.configStore.update((config) => {
      if (proxy.url !== undefined) config.proxy.url = proxy.url;
      if (proxy.bypass !== undefined) config.proxy.bypass = proxy.bypass;
    });
    // Child processes read the proxy from their environment, so the CLI adapter
    // is rebuilt with the new vars.
    await this.resolveCli();
    this.emit();
  }

  async setThresholds(thresholds: { overlap?: number; duplicate?: number }): Promise<void> {
    await this.configStore.update((config) => {
      if (thresholds.overlap !== undefined) config.thresholds.overlap = thresholds.overlap;
      if (thresholds.duplicate !== undefined) config.thresholds.duplicate = thresholds.duplicate;
    });
    this.emit();
  }

  async setShowInternal(showInternal: boolean): Promise<void> {
    await this.configStore.update((config) => {
      config.showInternal = showInternal;
    });
    this.emit();
  }

  async setLlm(llm: LlmSettings): Promise<void> {
    await this.configStore.update((config) => {
      config.llm = sanitizeLlm(llm);
    });
    this.emit();
  }

  async setCustomSkillDirs(dirs: string[]): Promise<void> {
    await this.configStore.update((config) => {
      config.customSkillDirs = normalizeCustomSkillDirs(dirs);
    });
    this.emit();
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
   * Coalesces per-token reasoning deltas so the renderer is not flooded with
   * one broadcast per character.
   */
  private createEventSink(): { onEvent: (event: EvaluationEvent) => void; flush: () => void } {
    let reasoningBuffer = '';
    const flush = () => {
      if (!reasoningBuffer) return;
      this.emitEvaluation({ type: 'reasoning', text: reasoningBuffer });
      reasoningBuffer = '';
    };
    const onEvent = (event: EvaluationEvent) => {
      if (event.type === 'reasoning') {
        reasoningBuffer += event.text ?? '';
        if (reasoningBuffer.length >= 160) flush();
        return;
      }
      flush();
      this.emitEvaluation(event);
    };
    return { onEvent, flush };
  }

  /**
   * Runs the LLM evaluation over every scanned skill and saves the report plus
   * the AI pair verdicts. Only called explicitly (button press).
   */
  async runEvaluation(locale: EvaluationLocale): Promise<void> {
    const settings = this.configStore.value.llm;
    if (!isLlmConfigured(settings)) throw new Error('LLM is not configured');
    const records = this.allRecords();
    if (records.length === 0) throw new Error('no skills to evaluate');

    this.state.evaluating = true;
    this.state.evaluationProgress = { done: 0, total: 0 };
    this.state.evaluationError = null;
    this.emit();

    const sink = this.createEventSink();
    try {
      const { report, verdicts } = await evaluateSkills({
        records,
        settings,
        locale,
        fetchImpl: this.remoteFetch ?? fetch,
        onEvent: sink.onEvent,
        onProgress: (progress) => {
          this.state.evaluationProgress = progress;
          this.emit();
        },
      });
      this.state.evaluation = report;
      this.state.verdicts = verdicts;
      this.state.verdictsAt = report.generatedAt;
      this.state.verdictsSignature = report.signature;
      this.rebuildFindings();
      await this.saveEvaluationStore();
    } catch (error) {
      this.state.evaluationError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      sink.flush();
      this.emitEvaluation({ type: 'done' });
      this.state.evaluating = false;
      this.state.evaluationProgress = null;
      this.emit();
    }
  }

  /**
   * Reviews only the heuristic candidate pairs and updates the AI verdicts,
   * keeping the existing report. Backs the "review candidates" button.
   */
  async runCandidateReview(locale: EvaluationLocale): Promise<void> {
    const settings = this.configStore.value.llm;
    if (!isLlmConfigured(settings)) throw new Error('LLM is not configured');
    const records = this.allRecords();
    if (records.length === 0) throw new Error('no skills to evaluate');

    this.state.reviewing = true;
    this.state.evaluationProgress = null;
    this.state.evaluationError = null;
    this.emit();

    const sink = this.createEventSink();
    try {
      const verdicts = await reviewCandidatePairs({
        records,
        settings,
        locale,
        fetchImpl: this.remoteFetch ?? fetch,
        onEvent: sink.onEvent,
      });
      this.state.verdicts = verdicts;
      this.state.verdictsAt = new Date().toISOString();
      this.state.verdictsSignature = this.currentSignature();
      this.rebuildFindings();
      await this.saveEvaluationStore();
    } catch (error) {
      this.state.evaluationError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      sink.flush();
      this.emitEvaluation({ type: 'done' });
      this.state.reviewing = false;
      this.state.evaluationProgress = null;
      this.emit();
    }
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
    const cli = this.ensureCli();
    const runOne = (target: AddTarget): AsyncOp => {
      const args = ['add', source, '-y'];
      if (target.scope === 'global') args.push('-g');
      args.push('-s', '*', '-a', '*');
      return cli.run(args, { cwd: target.cwd });
    };

    if (targets.length <= 1) {
      return runOne(targets[0] ?? { scope: 'global' });
    }

    const id = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let current: AsyncOp | null = null;
    let cancelled = false;
    let settle!: (result: OpResult) => void;
    const result = new Promise<OpResult>((resolve) => {
      settle = resolve;
    });

    const lines = (async function* () {
      let ok = true;
      let code: number | null = 0;
      try {
        for (const target of targets) {
          if (cancelled) {
            ok = false;
            code = null;
            break;
          }
          yield `# ${target.scope === 'global' ? 'global' : (target.cwd ?? 'project')}`;
          const op = runOne(target);
          current = op;
          for await (const line of op.lines) yield line;
          const outcome = await op.result;
          if (!outcome.ok) {
            ok = false;
            code = outcome.code;
          }
        }
      } finally {
        current = null;
        settle({ ok, code });
      }
    })();

    return {
      id,
      title: `add ${source}`,
      lines,
      result,
      cancel: () => {
        cancelled = true;
        current?.cancel();
      },
    };
  }

  runRemove(name: string, options: { scope: Scope; cwd?: string }): AsyncOp {
    const cli = this.ensureCli();
    const args = ['remove', name, '-y'];
    if (options.scope === 'global') args.push('-g');
    return cli.run(args, { cwd: options.cwd });
  }

  runUpdate(
    names: string[],
    options: { scope: Scope; cwd?: string },
  ): AsyncOp {
    const cli = this.ensureCli();
    const args = ['update', ...names, '-y'];
    args.push(options.scope === 'global' ? '-g' : '-p');
    return cli.run(args, { cwd: options.cwd });
  }

  runInit(name: string | null, cwd: string): AsyncOp {
    const cli = this.ensureCli();
    const args = ['init'];
    if (name) args.push(name);
    return cli.run(args, { cwd });
  }

  private ensureCli(): SkillsCli {
    if (!this.cli) {
      throw new Error(this.resolved?.error ?? 'skills CLI is not available; check settings');
    }
    return this.cli;
  }

  async doctor(): Promise<DoctorReport> {
    const warnings: DoctorWarning[] = [];
    const config = this.configStore.value;
    const lockFiles: DoctorReport['lockFiles'] = [];

    const globalLock = getGlobalLockPath();
    const globalLockData = await readLock(globalLock);
    lockFiles.push({
      path: globalLock,
      ok: Object.keys(globalLockData.skills).length > 0 || globalLockData.version > 0,
      count: Object.keys(globalLockData.skills).length,
    });
    for (const entry of config.projects) {
      const path = getProjectLockPath(entry.path);
      const lock = await readLock(path);
      const count = Object.keys(lock.skills).length;
      if (count > 0) lockFiles.push({ path, ok: true, count });
    }

    let version: string | null = null;
    if (this.cli) {
      version = await this.cli.version();
      if (!version) warnings.push({ code: 'doctor.cliVersionFailed' });
    } else {
      warnings.push({
        code: 'doctor.cliUnavailable',
        params: { error: this.resolved?.error ?? 'unknown error' },
      });
    }
    if (config.roots.length === 0) warnings.push({ code: 'doctor.noRoots' });
    if (!isValidProxyUrl(config.proxy.url)) warnings.push({ code: 'doctor.invalidProxy' });

    return {
      ok: warnings.length === 0,
      configDir: this.configStore.dir,
      cli: {
        command: this.resolved?.command ?? null,
        version,
        error: this.resolved?.error,
      },
      proxy: isValidProxyUrl(config.proxy.url) ? normalizeProxyUrl(config.proxy.url) : null,
      lockFiles,
      warnings,
    };
  }
}
