/**
 * Runtime trigger-observation types.
 *
 * A "bridge" is an optional, user-installed integration that lets an external
 * agent report skill activations back to SkillCat. Adapters are registered in
 * `bridge/registry.ts`; adding a new agent means adding one adapter module and
 * registering it, never touching the generic layers.
 */
import type { Scope } from './domain.js';

/** How a skill was activated. */
export type TriggerOrigin = 'model' | 'user';

/**
 * Adapter output for one spool record, before it is matched against the
 * scanned catalog. Catalog-agnostic on purpose, so adapters stay simple.
 */
export interface ParsedRuntimeEvent {
  adapterId: string;
  skillName: string;
  path: string | null;
  source: TriggerOrigin;
  phrase: string | null;
  task: string | null;
  taskId: string | null;
  sessionId: string | null;
  cwd: string | null;
  at: string;
}

/** A fully resolved activation, matched to a scanned skill and persisted. */
export interface RuntimeSkillEvent {
  id: string;
  adapterId: string;
  agentDisplay: string;
  skillName: string;
  /** Matched skill identity (`scope|projectPath|name`). */
  skillKey: string;
  scope: Scope;
  projectPath?: string;
  /** Task label: in-progress todo, else session title, else prompt snippet. */
  task: string | null;
  taskId: string | null;
  source: TriggerOrigin;
  /** Truncated user prompt fragment that led to the activation. */
  phrase: string | null;
  /** Longest skill trigger term found in the phrase, when any. */
  triggerTerm: string | null;
  sessionId: string | null;
  cwd: string | null;
  at: string;
}

/** One generated file of an install plan. */
export interface BridgeFile {
  path: string;
  content: string;
  mode?: number;
}

export interface BridgeInstallPlan {
  files: BridgeFile[];
  /** Marker embedded in generated files, authorizing safe removal. */
  marker: string;
}

export interface BridgeDetection {
  available: boolean;
  /** Locations relevant to this adapter (install dir, plugin path, …). */
  targets: string[];
}

export interface BridgeStatus {
  id: string;
  agentId: string;
  display: string;
  available: boolean;
  installed: boolean;
  targets: string[];
  installedAt: string | null;
  version: string | null;
}

/** Persisted manifest of what SkillCat installed, for exact uninstall. */
export interface IntegrationRecord {
  adapterId: string;
  version: string;
  installedAt: string;
  files: Array<{ path: string; hash: string }>;
}

export type IntegrationsFile = Record<string, IntegrationRecord>;

/** Everything an adapter needs to locate paths and generate its plugin. */
export interface BridgeContext {
  configDir: string;
  homeDir: string;
  platform: NodeJS.Platform;
  /** Absolute path of the spool file bridge plugins append to. */
  spoolPath: string;
}

export interface BridgeAdapter {
  id: string;
  /** Matches an `AgentDef.id` in `agents.ts`. */
  agentId: string;
  display: string;
  version: string;
  detect(ctx: BridgeContext): Promise<BridgeDetection>;
  plan(ctx: BridgeContext): BridgeInstallPlan;
  parse(raw: unknown): ParsedRuntimeEvent | null;
}

export interface ActivitySettings {
  /** When off, incoming bridge events are ignored (and not persisted). */
  enabled: boolean;
  /** Whether the triggering prompt fragment is stored at all. */
  storePhrase: boolean;
  /** Retention window in days, clamped to 30–360. */
  retentionDays: number;
  /** Maximum stored phrase length, clamped to 40–4000. */
  maxPhraseChars: number;
}

/** A labelled count used by the activity charts. */
export interface ActivityCount {
  key: string;
  label: string;
  count: number;
}

export interface ActivitySkillStat extends ActivityCount {
  lastAt: string;
  lastPhrase: string | null;
}

/** A phrase that activated more than one skill — the conflict signal. */
export interface ActivityPhraseConflict {
  phrase: string;
  skills: string[];
  count: number;
}

export interface ActivityStats {
  total: number;
  uniqueSkills: number;
  activeAgents: number;
  unmatched: number;
  bySkill: ActivitySkillStat[];
  byAgent: ActivityCount[];
  byDay: Array<{ day: string; count: number }>;
  phraseConflicts: ActivityPhraseConflict[];
}
