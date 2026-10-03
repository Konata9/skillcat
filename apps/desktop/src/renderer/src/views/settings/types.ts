/**
 * Shared types for the settings view and its section components: the category
 * model, the persisted save patch, the editable draft, and the per-section
 * form shapes. Kept in one place so the shell, the form hook and every section
 * agree on the same contract.
 */
import type {
  ActivitySettings,
  LlmProvider,
  LlmSettings,
  LlmTestResult,
  LogLevel,
  LoggingSettings,
} from '@skillcat/core';

export type SettingsCategory =
  | 'general'
  | 'scanning'
  | 'cli'
  | 'network'
  | 'llm'
  | 'integrations'
  | 'logging'
  | 'updates';

/** Fully-resolved patch handed to the host when the settings form is saved. */
export interface SettingsSavePatch {
  roots: string[];
  proxy: { url: string; bypass: string };
  thresholds: { overlap: number; duplicate: number };
  skillsCommand: string[] | null;
  showInternal: boolean;
  customSkillDirs: string[];
  llm: LlmSettings;
  activity: ActivitySettings;
  logging: LoggingSettings;
}

/**
 * Editable form model. Numeric inputs are held as strings so a partially typed
 * value never round-trips through `Number`, and are parsed/clamped on save.
 */
export interface SettingsDraft {
  roots: string;
  skillDirs: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  proxyBypass: string;
  overlap: string;
  duplicate: string;
  command: string;
  showInternal: boolean;
  llmEnabled: boolean;
  llmProvider: LlmProvider;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  activityEnabled: boolean;
  activityStorePhrase: boolean;
  activityRetention: string;
  activityPhraseChars: string;
  loggingEnabled: boolean;
  loggingLevel: LogLevel;
  loggingSize: string;
}

/** Applies a partial change to the draft and marks it dirty. */
export type SettingsPatch = (partial: Partial<SettingsDraft>) => void;

export interface LlmForm {
  enabled: boolean;
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  showApiKey: boolean;
  result: LlmTestResult | null;
  setEnabled: (value: boolean) => void;
  setApiKey: (value: string) => void;
  setBaseUrl: (value: string) => void;
  setModel: (value: string) => void;
  setShowApiKey: (value: boolean) => void;
  changeProvider: (provider: LlmProvider) => void;
}

export interface ActivityForm {
  enabled: boolean;
  storePhrase: boolean;
  retention: string;
  phraseChars: string;
  setEnabled: (value: boolean) => void;
  setStorePhrase: (value: boolean) => void;
  setRetention: (value: string) => void;
  setPhraseChars: (value: string) => void;
}

export interface LoggingForm {
  enabled: boolean;
  level: LogLevel;
  maxTotalMb: string;
  setEnabled: (value: boolean) => void;
  setLevel: (value: LogLevel) => void;
  setMaxTotalMb: (value: string) => void;
}
