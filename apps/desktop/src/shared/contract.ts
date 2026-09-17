import type {
  Annotation,
  AppConfig,
  DoctorReport,
  Finding,
  OrphanLock,
  ProjectInfo,
  RemoteSkill,
  Scope,
  SkillRecord,
} from '@skillman/core';

export interface Snapshot {
  loading: boolean;
  scannedAt: string | null;
  global: SkillRecord[];
  projects: Array<{ path: string; records: SkillRecord[] }>;
  orphans: OrphanLock[];
  findings: Finding[];
  projectErrors: Array<{ path: string; error: string }>;
  config: AppConfig;
  cliAvailable: boolean;
  cliSource: string;
  cliError?: string;
}

export interface SkillRefLite {
  scope: Scope;
  projectPath?: string;
  name: string;
}

export type OpStart =
  | { kind: 'add'; source: string; scope: Scope; cwd?: string; title: string }
  | { kind: 'remove'; name: string; scope: Scope; cwd?: string; title: string }
  | { kind: 'update'; names: string[]; scope: Scope; cwd?: string; title: string };

export interface OpEvent {
  opId: string;
  line?: string;
  done?: boolean;
  ok?: boolean;
}

export interface SettingsPatch {
  skillsCommand?: string[] | null;
  proxy?: { url: string; bypass: string };
  thresholds?: { overlap?: number; duplicate?: number };
  showInternal?: boolean;
}

export interface SkillmanApi {
  getSnapshot(): Promise<Snapshot>;
  refresh(options?: { deep?: boolean; projectPaths?: string[] }): Promise<void>;
  listProjects(): Promise<ProjectInfo[]>;
  addProject(path: string, options?: { alias?: string; pinned?: boolean }): Promise<void>;
  removeProject(path: string): Promise<void>;
  setProjectPinned(path: string, pinned: boolean): Promise<void>;
  setRoots(roots: string[]): Promise<void>;
  setSettings(patch: SettingsPatch): Promise<void>;
  getAnnotation(ref: SkillRefLite): Promise<Annotation | null>;
  saveAnnotation(ref: SkillRefLite, annotation: Annotation | null): Promise<void>;
  searchRemote(query: string): Promise<RemoteSkill[]>;
  startOp(op: OpStart): Promise<{ opId: string }>;
  cancelOp(opId: string): Promise<void>;
  openSkill(ref: SkillRefLite): Promise<void>;
  revealSkill(ref: SkillRefLite): Promise<void>;
  pickDirectory(): Promise<string | null>;
  doctor(): Promise<DoctorReport>;
  onStateChanged(callback: (snapshot: Snapshot) => void): () => void;
  onOpEvent(callback: (event: OpEvent) => void): () => void;
}

export const CH = {
  snapshot: 'app:snapshot',
  refresh: 'app:refresh',
  projectsList: 'projects:list',
  projectsAdd: 'projects:add',
  projectsRemove: 'projects:remove',
  projectsPin: 'projects:pin',
  rootsSet: 'roots:set',
  settingsSet: 'settings:set',
  annotationGet: 'annotation:get',
  annotationSave: 'annotation:save',
  searchRemote: 'search:remote',
  opStart: 'op:start',
  opCancel: 'op:cancel',
  openSkill: 'open:skill',
  revealSkill: 'reveal:skill',
  pickDirectory: 'dialog:pick-directory',
  doctor: 'app:doctor',
  stateChanged: 'event:state-changed',
  opEvent: 'event:op',
} as const;
