/**
 * Public API of `@skillcat/core`. Consumers (the Electron app, future UIs)
 * import from this entry only; internal modules are implementation details.
 */
export * from './types.js';
export { SkillManager, type ManagerState, type RefreshOptions } from './manager.js';
export { findConflicts, type ConflictInput } from './conflicts.js';
export {
  extractTriggers,
  applyAnnotation,
  normalizeTerm,
  splitList,
  type TriggerInput,
} from './triggers.js';
export { recordKey, annotationKey } from './keys.js';
export {
  tokenize,
  computeOverlaps,
  bodySimilarity,
  bodyShingles,
  jaccard,
  type OverlapPair,
  type SkillVector,
} from './similarity.js';
export { parseFrontmatter, parseSkillDir, findSkillMd, buildFileInfos } from './skill.js';
export {
  scanScope,
  readLock,
  collectAgentDirs,
  type AgentDirInfo,
  type ScanScopeOptions,
  type ScanScopeResult,
} from './discovery.js';
export { discoverProjects, type DiscoveredProject } from './projects.js';
export { AGENTS, getAgentById, type AgentDef } from './agents.js';
export { resolveSkillsCommand, type ResolvedCommand, type CommandSource } from './cli/env.js';
export { SkillsCli, SkillsCliError, type SkillsCliOptions } from './cli/skills-cli.js';
export { stripAnsi, cleanOutputLine } from './cli/ansi.js';
export {
  buildProxyEnv,
  isValidProxyUrl,
  normalizeProxyUrl,
} from './cli/proxy.js';
export {
  fetchLeaderboardApi,
  searchRemoteApi,
  searchRemoteViaCli,
  parseFindOutput,
  type FetchLike,
  type FetchLikeResponse,
} from './cli/remote-search.js';
export { ConfigStore, defaultConfig, sanitizeLlm } from './config.js';
export {
  LLM_PROVIDERS,
  defaultLlmSettings,
  getLlmPreset,
  testLlmConnection,
  type LlmProviderPreset,
  type LlmTestResult,
} from './llm.js';
export { SidecarStore } from './sidecar.js';
export {
  APP_NAME,
  expandHome,
  getConfigDir,
  getGlobalSkillsDir,
  getGlobalLockPath,
  getProjectLockPath,
  getProjectSkillsDir,
  configFilePath,
  stateFilePath,
  annotationsFilePath,
} from './paths.js';
export {
  computeSkillFolderHash,
  walkFiles,
  pathExists,
  isDirectory,
  lstatSafe,
  readFileSafe,
  readJsonSafe,
  readdirSafe,
  atomicWriteFile,
  ensureDir,
  safeRealpath,
} from './fs-utils.js';
