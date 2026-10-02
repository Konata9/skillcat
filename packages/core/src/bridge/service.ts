/**
 * BridgeService owns everything the runtime trigger observation needs that is
 * not agent-specific:
 *
 * - the install manifest (for exact, reversible uninstall),
 * - the spool inbox and its watcher,
 * - the matched activity log and its retention,
 * - status reporting for the settings UI.
 *
 * Agent specifics live entirely in the registered adapters.
 */
import { createHash } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { chmod, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { homedir } from 'node:os';
import {
  atomicWriteFile,
  ensureDir,
  pathExists,
  readFileSafe,
  readJsonSafe,
} from '../fs-utils.js';
import {
  integrationsFilePath,
  runtimeEventsFilePath,
  runtimeSpoolFilePath,
} from '../paths.js';
import type {
  ActivitySettings,
  ActivityStats,
  BridgeContext,
  BridgeStatus,
  IntegrationsFile,
  ParsedRuntimeEvent,
  RuntimeSkillEvent,
  SkillRecord,
} from '../types.js';
import {
  buildCatalogIndex,
  localizeEvent,
  parseSpoolContent,
  type CatalogIndex,
} from './events.js';
import { getBridgeAdapter, listBridgeAdapters } from './registry.js';
import { computeActivityStats } from './stats.js';

const MAX_EVENTS = 5000;
const DEFAULT_ACTIVITY: ActivitySettings = {
  enabled: true,
  storePhrase: true,
  retentionDays: 90,
  maxPhraseChars: 300,
};

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function isRuntimeEvent(value: unknown): value is RuntimeSkillEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === 'string' &&
    typeof event.skillKey === 'string' &&
    typeof event.skillName === 'string' &&
    typeof event.at === 'string'
  );
}

export interface BridgeServiceOptions {
  configDir: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

export class BridgeService {
  readonly dir: string;
  private readonly home: string;
  private readonly platform: NodeJS.Platform;
  private index: CatalogIndex = { byPath: new Map(), byName: new Map() };
  private manifest: IntegrationsFile = {};
  private events: RuntimeSkillEvent[] = [];
  private activity: ActivitySettings = DEFAULT_ACTIVITY;
  private unmatched = 0;
  private watcher: FSWatcher | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private activityListeners = new Set<(event: RuntimeSkillEvent[]) => void>();

  constructor(options: BridgeServiceOptions) {
    this.dir = options.configDir;
    this.home = options.homeDir ?? homedir();
    this.platform = options.platform ?? process.platform;
  }

  get spoolPath(): string {
    return runtimeSpoolFilePath(this.dir);
  }

  private context(): BridgeContext {
    return {
      configDir: this.dir,
      homeDir: this.home,
      platform: this.platform,
      spoolPath: this.spoolPath,
    };
  }

  async load(): Promise<void> {
    const manifest = await readJsonSafe<IntegrationsFile>(integrationsFilePath(this.dir));
    this.manifest = manifest && typeof manifest === 'object' ? manifest : {};
    const raw = await readJsonSafe<unknown>(runtimeEventsFilePath(this.dir));
    this.events = Array.isArray(raw) ? raw.filter(isRuntimeEvent) : [];
    this.trim();
  }

  setCatalog(records: SkillRecord[]): void {
    this.index = buildCatalogIndex(records);
  }

  setActivitySettings(settings: ActivitySettings): void {
    this.activity = settings;
  }

  onActivity(listener: (events: RuntimeSkillEvent[]) => void): () => void {
    this.activityListeners.add(listener);
    return () => {
      this.activityListeners.delete(listener);
    };
  }

  private emitActivity(added: RuntimeSkillEvent[]): void {
    for (const listener of this.activityListeners) listener(added);
  }

  // --- Activity log -------------------------------------------------------

  activityEvents(): RuntimeSkillEvent[] {
    return this.events;
  }

  activityStats(): ActivityStats {
    return computeActivityStats(this.events, { unmatched: this.unmatched });
  }

  activityCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of this.events) counts[event.skillKey] = (counts[event.skillKey] ?? 0) + 1;
    return counts;
  }

  async clearActivity(): Promise<void> {
    this.events = [];
    this.unmatched = 0;
    await this.saveEvents();
    this.emitActivity([]);
  }

  private trim(): void {
    const cutoff = Date.now() - this.activity.retentionDays * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoff).toISOString();
    this.events = this.events
      .filter((event) => event.at >= cutoffIso)
      .slice(-MAX_EVENTS);
  }

  private async saveEvents(): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(
      runtimeEventsFilePath(this.dir),
      `${JSON.stringify(this.events, null, 2)}\n`,
    );
  }

  private async saveManifest(): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(
      integrationsFilePath(this.dir),
      `${JSON.stringify(this.manifest, null, 2)}\n`,
    );
  }

  private adapterFor(record: unknown) {
    if (typeof record !== 'object' || record === null) return undefined;
    const id = (record as Record<string, unknown>).adapterId;
    return typeof id === 'string' ? getBridgeAdapter(id) : undefined;
  }

  /** Consumes the spool, matching each record against the scanned catalog. */
  async ingest(): Promise<{ added: RuntimeSkillEvent[] }> {
    if (!this.activity.enabled) return { added: [] };
    const raw = await readFileSafe(this.spoolPath);
    if (raw === null || !raw.trim()) return { added: [] };

    const added: RuntimeSkillEvent[] = [];
    for (const record of parseSpoolContent(raw)) {
      const adapter = this.adapterFor(record);
      if (!adapter) continue;
      const parsed: ParsedRuntimeEvent | null = adapter.parse(record);
      if (!parsed) continue;
      const event = localizeEvent(parsed, adapter, this.index, {
        storePhrase: this.activity.storePhrase,
        maxPhraseChars: this.activity.maxPhraseChars,
      });
      if (event) added.push(event);
      else this.unmatched += 1;
    }

    await atomicWriteFile(this.spoolPath, '');
    if (added.length > 0) {
      this.events.push(...added);
      this.trim();
      await this.saveEvents();
      this.emitActivity(added);
    }
    return { added };
  }

  startWatching(): void {
    if (this.watcher) return;
    const target = basename(this.spoolPath);
    try {
      this.watcher = watch(this.dir, { persistent: false }, (_event, filename) => {
        if (filename && filename.toString() !== target) return;
        this.scheduleIngest();
      });
    } catch {
      this.watcher = null;
    }
  }

  private scheduleIngest(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.ingest().catch(() => {
        // A failed ingest is retried on the next spool write.
      });
    }, 250);
  }

  // --- Install / uninstall ------------------------------------------------

  async statuses(): Promise<BridgeStatus[]> {
    const ctx = this.context();
    const result: BridgeStatus[] = [];
    for (const adapter of listBridgeAdapters()) {
      const detection = await adapter.detect(ctx);
      const record = this.manifest[adapter.id];
      result.push({
        id: adapter.id,
        agentId: adapter.agentId,
        display: adapter.display,
        available: detection.available,
        installed: Boolean(record),
        targets: record ? record.files.map((file) => file.path) : detection.targets,
        installedAt: record?.installedAt ?? null,
        version: record?.version ?? null,
      });
    }
    return result;
  }

  async install(id: string): Promise<void> {
    const adapter = getBridgeAdapter(id);
    if (!adapter) throw new Error(`unknown bridge adapter: ${id}`);
    const plan = adapter.plan(this.context());

    for (const file of plan.files) {
      if (!(await pathExists(file.path))) continue;
      const existing = await readFileSafe(file.path);
      if (existing !== null && !existing.includes(plan.marker)) {
        throw new Error(`refusing to overwrite a non-SkillCat file: ${file.path}`);
      }
    }

    const files: Array<{ path: string; hash: string }> = [];
    for (const file of plan.files) {
      await atomicWriteFile(file.path, file.content);
      if (file.mode !== undefined) {
        try {
          await chmod(file.path, file.mode);
        } catch {
          // Mode is best-effort; content is what matters.
        }
      }
      files.push({ path: file.path, hash: sha256(file.content) });
    }

    this.manifest[id] = {
      adapterId: id,
      version: adapter.version,
      installedAt: new Date().toISOString(),
      files,
    };
    await this.saveManifest();
  }

  async uninstall(id: string): Promise<void> {
    const record = this.manifest[id];
    if (!record) return;
    for (const file of record.files) {
      const current = await readFileSafe(file.path);
      if (current === null) continue;
      if (sha256(current) !== file.hash) {
        throw new Error(`file changed since install; not removed: ${file.path}`);
      }
      await rm(file.path, { force: true });
    }
    delete this.manifest[id];
    await this.saveManifest();
  }

  isInstalled(id: string): boolean {
    return Boolean(this.manifest[id]);
  }
}
