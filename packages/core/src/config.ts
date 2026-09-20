/**
 * `config.json` persistence: load, sanitize and atomically save the app config.
 * Sanitizing keeps a hand-edited or partially corrupted file from crashing the
 * app — unknown fields fall back to defaults.
 */
import { cp } from 'node:fs/promises';
import { dirname } from 'node:path';
import { atomicWriteFile, ensureDir, pathExists, readJsonSafe } from './fs-utils.js';
import { defaultLlmSettings, getLlmPreset, LLM_PROVIDERS } from './llm.js';
import { configFilePath, getConfigDir, getLegacyConfigDir } from './paths.js';
import type { AppConfig, LlmProvider, LlmSettings } from './types.js';

export function defaultConfig(): AppConfig {
  return {
    version: 1,
    roots: [],
    projects: [],
    recent: [],
    skillsCommand: null,
    proxy: { url: '', bypass: '' },
    thresholds: { overlap: 0.3, duplicate: 0.5 },
    showInternal: false,
    maxScanDepth: 3,
    customSkillDirs: [],
    llm: defaultLlmSettings(),
  };
}

/** Trims, drops empties and de-duplicates user-configured skill dirs. */
export function normalizeCustomSkillDirs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const dir = item.trim();
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    dirs.push(dir);
  }
  return dirs;
}

/** Validates a persisted LLM config, falling back to provider presets. */
export function sanitizeLlm(raw: unknown): LlmSettings {
  const base = defaultLlmSettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Partial<LlmSettings>;
  const provider: LlmProvider = LLM_PROVIDERS.some((preset) => preset.id === input.provider)
    ? (input.provider as LlmProvider)
    : base.provider;
  const preset = getLlmPreset(provider);
  return {
    enabled: input.enabled === true,
    provider,
    apiKey: typeof input.apiKey === 'string' ? input.apiKey : base.apiKey,
    baseUrl:
      typeof input.baseUrl === 'string' && input.baseUrl.trim()
        ? input.baseUrl
        : preset.baseUrl,
    model:
      typeof input.model === 'string' && input.model.trim() ? input.model : preset.model,
  };
}

function sanitize(raw: unknown): AppConfig {
  const base = defaultConfig();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Partial<AppConfig>;
  return {
    version: 1,
    roots: Array.isArray(input.roots)
      ? input.roots.filter((item): item is string => typeof item === 'string')
      : base.roots,
    projects: Array.isArray(input.projects)
      ? input.projects
          .filter(
            (item): item is { path: string; alias?: string; pinned?: boolean } =>
              typeof item === 'object' &&
              item !== null &&
              typeof (item as { path?: unknown }).path === 'string',
          )
          .map((item) => ({
            path: item.path,
            alias: typeof item.alias === 'string' ? item.alias : undefined,
            pinned: item.pinned === true,
          }))
      : base.projects,
    recent: Array.isArray(input.recent)
      ? input.recent.filter((item): item is string => typeof item === 'string')
      : base.recent,
    skillsCommand:
      Array.isArray(input.skillsCommand) &&
      input.skillsCommand.every((item) => typeof item === 'string') &&
      input.skillsCommand.length > 0
        ? input.skillsCommand
        : null,
    proxy: {
      url: typeof input.proxy?.url === 'string' ? input.proxy.url : base.proxy.url,
      bypass: typeof input.proxy?.bypass === 'string' ? input.proxy.bypass : base.proxy.bypass,
    },
    thresholds: {
      overlap:
        typeof input.thresholds?.overlap === 'number' &&
        input.thresholds.overlap >= 0 &&
        input.thresholds.overlap <= 1
          ? input.thresholds.overlap
          : base.thresholds.overlap,
      duplicate:
        typeof input.thresholds?.duplicate === 'number' &&
        input.thresholds.duplicate >= 0 &&
        input.thresholds.duplicate <= 1
          ? input.thresholds.duplicate
          : base.thresholds.duplicate,
    },
    showInternal: input.showInternal === true,
    maxScanDepth:
      typeof input.maxScanDepth === 'number' && input.maxScanDepth >= 0 && input.maxScanDepth <= 8
        ? input.maxScanDepth
        : base.maxScanDepth,
    customSkillDirs: normalizeCustomSkillDirs(input.customSkillDirs),
    llm: sanitizeLlm(input.llm),
  };
}

export class ConfigStore {
  readonly dir: string;
  private config: AppConfig;

  constructor(dir: string = getConfigDir()) {
    this.dir = dir;
    this.config = defaultConfig();
  }

  get value(): AppConfig {
    return this.config;
  }

  get filePath(): string {
    return configFilePath(this.dir);
  }

  async load(): Promise<AppConfig> {
    await this.migrateLegacyDir();
    const raw = await readJsonSafe<unknown>(this.filePath);
    this.config = sanitize(raw);
    return this.config;
  }

  /**
   * One-time migration for the Skillman → SkillCat rename: when the default
   * config dir has no config yet and the legacy dir has one, copy it over
   * (settings, annotations and scan state included). Custom `configDir`
   * overrides are never migrated.
   */
  private async migrateLegacyDir(): Promise<void> {
    if (this.dir !== getConfigDir()) return;
    const legacyDir = getLegacyConfigDir();
    if (legacyDir === this.dir) return;
    if (await pathExists(this.filePath)) return;
    if (!(await pathExists(configFilePath(legacyDir)))) return;
    await ensureDir(this.dir);
    await cp(legacyDir, this.dir, { recursive: true, force: false, errorOnExist: false });
  }

  async save(): Promise<void> {
    await ensureDir(dirname(this.filePath));
    await atomicWriteFile(this.filePath, `${JSON.stringify(this.config, null, 2)}\n`);
  }

  /** Writes the current config to disk when the file does not exist yet. */
  async ensureFile(): Promise<void> {
    if (await pathExists(this.filePath)) return;
    await this.save();
  }

  async update(mutator: (config: AppConfig) => void): Promise<AppConfig> {
    mutator(this.config);
    await this.save();
    return this.config;
  }

  addRecent(projectPath: string): void {
    const recent = [projectPath, ...this.config.recent.filter((item) => item !== projectPath)];
    this.config.recent = recent.slice(0, 20);
  }

  isPinned(projectPath: string): boolean {
    return this.config.projects.some((item) => item.path === projectPath && item.pinned);
  }
}
