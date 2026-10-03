/**
 * Configuration and project-registry mutations of `SkillManager`.
 *
 * Each mutation is a thin wrapper over `ConfigStore.update` plus the side
 * effects a config change implies: rebuilding the CLI adapter when its
 * environment changes, pushing activity settings into the bridge, and emitting
 * a change notification. Extracted from the facade so the facade only
 * orchestrates.
 */
import { sanitizeActivity } from '../bridge/limits.js';
import { sanitizeLogging } from '../logging.js';
import { normalizeCustomSkillDirs, sanitizeLlm, type ConfigStore } from '../config.js';
import type { BridgeService } from '../bridge/service.js';
import type {
  ActivitySettings,
  LlmSettings,
  LoggingSettings,
  ProxySettings,
} from '../types.js';
import type { ManagerState } from './state.js';

export interface SettingsDeps {
  configStore: ConfigStore;
  bridge: BridgeService;
  state: ManagerState;
  /** Rebuilds the resolved CLI adapter (proxy / command changes). */
  resolveCli: () => Promise<void>;
  emit: () => void;
}

export class SettingsController {
  constructor(private readonly deps: SettingsDeps) {}

  /** Persists diagnostic-log preferences; the host applies them to its logger. */
  async setLogging(settings: LoggingSettings): Promise<void> {
    const next = sanitizeLogging(settings);
    await this.deps.configStore.update((config) => {
      config.logging = next;
    });
    this.deps.emit();
  }

  async addProject(path: string, options: { alias?: string; pinned?: boolean } = {}): Promise<void> {
    await this.deps.configStore.update((config) => {
      const existing = config.projects.find((entry) => entry.path === path);
      if (existing) {
        if (options.alias !== undefined) existing.alias = options.alias;
        if (options.pinned !== undefined) existing.pinned = options.pinned;
      } else {
        config.projects.push({ path, alias: options.alias, pinned: options.pinned });
      }
      config.recent = [path, ...config.recent.filter((item) => item !== path)].slice(0, 20);
    });
    this.deps.emit();
  }

  async removeProject(path: string): Promise<void> {
    await this.deps.configStore.update((config) => {
      config.projects = config.projects.filter((entry) => entry.path !== path);
      config.recent = config.recent.filter((item) => item !== path);
    });
    this.deps.state.projects.delete(path);
    this.deps.emit();
  }

  async setProjectPinned(path: string, pinned: boolean): Promise<void> {
    await this.deps.configStore.update((config) => {
      const existing = config.projects.find((entry) => entry.path === path);
      if (existing) existing.pinned = pinned;
      else config.projects.push({ path, pinned });
    });
    this.deps.emit();
  }

  async setRoots(roots: string[]): Promise<void> {
    await this.deps.configStore.update((config) => {
      config.roots = [...new Set(roots.filter(Boolean))];
    });
    this.deps.emit();
  }

  async setSkillsCommand(command: string[] | null): Promise<void> {
    await this.deps.configStore.update((config) => {
      config.skillsCommand = command;
    });
    await this.deps.resolveCli();
    this.deps.emit();
  }

  async setProxy(proxy: Partial<ProxySettings>): Promise<void> {
    await this.deps.configStore.update((config) => {
      if (proxy.url !== undefined) config.proxy.url = proxy.url;
      if (proxy.bypass !== undefined) config.proxy.bypass = proxy.bypass;
    });
    // Child processes read the proxy from their environment, so the CLI adapter
    // is rebuilt with the new vars.
    await this.deps.resolveCli();
    this.deps.emit();
  }

  async setThresholds(thresholds: { overlap?: number; duplicate?: number }): Promise<void> {
    await this.deps.configStore.update((config) => {
      if (thresholds.overlap !== undefined) config.thresholds.overlap = thresholds.overlap;
      if (thresholds.duplicate !== undefined) config.thresholds.duplicate = thresholds.duplicate;
    });
    this.deps.emit();
  }

  async setShowInternal(showInternal: boolean): Promise<void> {
    await this.deps.configStore.update((config) => {
      config.showInternal = showInternal;
    });
    this.deps.emit();
  }

  async setLlm(llm: LlmSettings): Promise<void> {
    await this.deps.configStore.update((config) => {
      config.llm = sanitizeLlm(llm);
    });
    this.deps.emit();
  }

  async setCustomSkillDirs(dirs: string[]): Promise<void> {
    await this.deps.configStore.update((config) => {
      config.customSkillDirs = normalizeCustomSkillDirs(dirs);
    });
    this.deps.emit();
  }

  async setActivity(settings: ActivitySettings): Promise<void> {
    const next = sanitizeActivity(settings);
    await this.deps.configStore.update((config) => {
      config.activity = next;
    });
    this.deps.bridge.setActivitySettings(next);
    this.deps.emit();
  }
}
