import type {
  AddTarget,
  Annotation,
  AppConfig,
  DoctorReport,
  EvaluationEvent,
  EvaluationProgress,
  EvaluationReport,
  Finding,
  LeaderboardKind,
  LlmSettings,
  LlmTestResult,
  OrphanLock,
  ProjectInfo,
  RemoteSkill,
  RemoteSkillDetail,
  Scope,
  SkillRecord,
  UpdateCheckResult,
} from '@skillcat/core';

export interface Snapshot {
  loading: boolean;
  version: string;
  scannedAt: string | null;
  global: SkillRecord[];
  projects: Array<{ path: string; records: SkillRecord[] }>;
  orphans: OrphanLock[];
  findings: Finding[];
  projectErrors: Array<{ path: string; error: string }>;
  config: AppConfig;
  configPath: string;
  cliAvailable: boolean;
  cliSource: string;
  cliError?: string;
  evaluation: EvaluationReport | null;
  evaluationStale: boolean;
  verdictsAt: string | null;
  verdictsStale: boolean;
  evaluating: boolean;
  reviewing: boolean;
  evaluationProgress: EvaluationProgress | null;
  evaluationError: string | null;
}

export interface SkillRefLite {
  scope: Scope;
  projectPath?: string;
  name: string;
}

export type OpStart =
  | { kind: 'add'; source: string; targets: AddTarget[]; title: string }
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
  customSkillDirs?: string[];
  llm?: LlmSettings;
}

export interface SkillCatApi {
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
  leaderboard(kind: LeaderboardKind, page?: number): Promise<RemoteSkill[]>;
  remoteSkillDetail(slug: string): Promise<RemoteSkillDetail>;
  evaluate(locale: 'zh' | 'en'): Promise<void>;
  reviewCandidates(locale: 'zh' | 'en'): Promise<void>;
  testLlm(settings: LlmSettings): Promise<LlmTestResult>;
  checkUpdate(): Promise<UpdateCheckResult>;
  openExternal(url: string): Promise<void>;
  startOp(op: OpStart): Promise<{ opId: string }>;
  cancelOp(opId: string): Promise<void>;
  openSkill(ref: SkillRefLite): Promise<void>;
  revealSkill(ref: SkillRefLite): Promise<void>;
  pickDirectory(): Promise<string | null>;
  openConfig(): Promise<void>;
  revealConfig(): Promise<void>;
  reloadConfig(): Promise<void>;
  doctor(): Promise<DoctorReport>;
  onStateChanged(callback: (snapshot: Snapshot) => void): () => void;
  onOpEvent(callback: (event: OpEvent) => void): () => void;
  onEvaluationEvent(callback: (event: EvaluationEvent) => void): () => void;
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
  leaderboard: 'search:leaderboard',
  remoteSkillDetail: 'search:detail',
  evaluate: 'evaluation:run',
  reviewCandidates: 'evaluation:review',
  testLlm: 'llm:test',
  checkUpdate: 'app:check-update',
  openExternal: 'app:open-external',
  opStart: 'op:start',
  opCancel: 'op:cancel',
  openSkill: 'open:skill',
  revealSkill: 'reveal:skill',
  pickDirectory: 'dialog:pick-directory',
  configOpen: 'config:open',
  configReveal: 'config:reveal',
  configReload: 'config:reload',
  doctor: 'app:doctor',
  stateChanged: 'event:state-changed',
  opEvent: 'event:op',
  evaluationEvent: 'event:evaluation',
} as const;
