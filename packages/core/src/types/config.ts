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

/** Supported LLM vendors. SkillCat ships no model; the user supplies a key. */
export type LlmProvider =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'glm'
  | 'kimi'
  | 'minimax'
  | 'mimo'
  | 'ollama'
  | 'custom';

export interface LlmSettings {
  provider: LlmProvider;
  /** API key, stored locally in config.json. Empty for keyless local servers. */
  apiKey: string;
  /** Base URL of the API, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  /** Model identifier, e.g. `gpt-4o`. */
  model: string;
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
  /** User-supplied language-model credentials. Never bundled by SkillCat. */
  llm: LlmSettings;
}
