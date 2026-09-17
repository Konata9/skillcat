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
}
