/**
 * Core domain model: skills, their files, agent links, trigger profiles and
 * project registry entries. These types describe what the tool reads from disk
 * and are UI-agnostic.
 */

export type Scope = 'global' | 'project';

export interface SkillRef {
  name: string;
  scope: Scope;
  projectPath?: string;
  path: string;
}

export interface LockEntry {
  source: string;
  sourceType: string;
  sourceUrl?: string;
  skillPath?: string;
  skillFolderHash?: string;
  installedAt?: string;
  updatedAt?: string;
  ref?: string;
}

export interface OrphanLock {
  name: string;
  scope: Scope;
  projectPath?: string;
  entry: LockEntry;
  expectedPath: string;
}

export type AgentLinkState =
  | 'canonical'
  | 'symlink-ok'
  | 'symlink-dangling'
  | 'copy'
  | 'missing';

export interface AgentLink {
  agentId: string;
  display: string;
  dir: string;
  path: string;
  state: AgentLinkState;
  target?: string;
  copyHash?: string;
}

export type TriggerSource =
  | 'when_to_use'
  | 'dispatch_intent'
  | 'description'
  | 'body'
  | 'name'
  | 'user';

export interface TriggerTerm {
  text: string;
  norm: string;
  kind: 'positive' | 'negative';
  source: TriggerSource;
  weight: number;
  user?: boolean;
}

export interface TriggerProfile {
  positive: TriggerTerm[];
  negative: TriggerTerm[];
  intents: string[];
  hasWhenSignal: boolean;
}

export interface SkillFileInfo {
  relativePath: string;
  size: number;
  kind: 'skill-md' | 'markdown' | 'script' | 'data' | 'other';
}

export interface SkillRecord {
  name: string;
  scope: Scope;
  path: string;
  projectPath?: string;
  description: string;
  frontmatter: Record<string, unknown>;
  body: string;
  bodyTruncated: boolean;
  source: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  agentsDeclared: string[];
  lock: LockEntry | null;
  links: AgentLink[];
  contentHash: string;
  files: SkillFileInfo[];
  sizeBytes: number;
  triggers: TriggerProfile;
  internal: boolean;
  installedAt: string | null;
  updatedAt: string | null;
  mtimeMs: number;
}

export interface ProjectEntry {
  path: string;
  alias?: string;
  pinned?: boolean;
}

export interface ProjectInfo {
  path: string;
  name: string;
  alias?: string;
  pinned: boolean;
  registered: boolean;
  discovered: boolean;
  markers: string[];
  skillCount: number | null;
  error?: string;
}
