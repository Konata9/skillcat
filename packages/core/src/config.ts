/**
 * `config.json` persistence: load, sanitize and atomically save the app config.
 * Sanitizing keeps a hand-edited or partially corrupted file from crashing the
 * app — unknown fields fall back to defaults.
 */
import { dirname } from 'node:path';
import { atomicWriteFile, ensureDir, readJsonSafe } from './fs-utils.js';
import { configFilePath, getConfigDir } from './paths.js';
import type { AppConfig } from './types.js';

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
    const raw = await readJsonSafe<unknown>(this.filePath);
    this.config = sanitize(raw);
    return this.config;
  }

  async save(): Promise<void> {
    await ensureDir(dirname(this.filePath));
    await atomicWriteFile(this.filePath, `${JSON.stringify(this.config, null, 2)}\n`);
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
