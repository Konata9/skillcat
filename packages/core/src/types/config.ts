/**
 * Persisted application configuration (`config.json`).
 */
import type { ProjectEntry } from './domain.js';

export interface Thresholds {
  overlap: number;
  duplicate: number;
}

export interface ProxySettings {
  /** Proxy URL, e.g. `http://127.0.0.1:7890`. Empty string means a direct connection. */
  url: string;
  /** Comma-separated bypass list (NO_PROXY), e.g. `localhost,127.0.0.1,.internal`. */
  bypass: string;
}

export interface AppConfig {
  version: 1;
  roots: string[];
  projects: ProjectEntry[];
  recent: string[];
  skillsCommand: string[] | null;
  proxy: ProxySettings;
  thresholds: Thresholds;
  showInternal: boolean;
  maxScanDepth: number;
  /**
   * Extra skill dirs to scan on top of the built-in agent registry. Entries
   * starting with `~` (or an absolute path) apply to the global scope;
   * everything else is resolved relative to each project root. Each entry is a
   * container dir whose children are skill folders with a `SKILL.md`.
   */
  customSkillDirs: string[];
}
