/**
 * Public API of `@skillcat/core`. Consumers (the Electron app, future UIs)
 * import from this entry only; internal modules are implementation details.
 */
export * from './types.js';
export { SkillManager, type ManagerState, type RefreshOptions } from './manager.js';
export { analyzeSkills, type AnalysisInput } from './analysis.js';
export { sortFindings } from './findings.js';
export {
  extractTriggers,
  applyAnnotation,
  normalizeTerm,
  splitList,
  type TriggerInput,
} from './triggers.js';
export { recordKey, annotationKey, scopeNameKey, pairKey } from './keys.js';
export {
  tokenize,
  computeOverlaps,
  bodySimilarity,
  bodyShingles,
  jaccard,
  type OverlapPair,
  type SkillVector,
} from './similarity.js';
export {
  parseFrontmatter,
  parseSkillDir,
  hasSkillMd,
  buildFileInfos,
} from './skill.js';
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
export {
  resolveSkillsCommand,
  type ResolvedCommand,
  type CommandSource,
  type BundledCli,
} from './cli/env.js';
export { SkillsCli, SkillsCliError, type SkillsCliOptions } from './cli/skills-cli.js';
export { stripAnsi, cleanOutputLine } from './cli/ansi.js';
export {
  buildProxyEnv,
  isValidProxyUrl,
  normalizeProxyUrl,
} from './cli/proxy.js';
export {
  fetchLeaderboardApi,
  fetchRemoteSkillDetail,
  searchRemoteApi,
  searchRemoteViaCli,
  parseFindOutput,
  type FetchLike,
  type FetchLikeResponse,
} from './cli/remote-search.js';
export { ConfigStore, defaultConfig, sanitizeLlm } from './config.js';
export {
  ACTIVITY_PHRASE_MAX,
  ACTIVITY_PHRASE_MIN,
  ACTIVITY_RETENTION_MAX,
  ACTIVITY_RETENTION_MIN,
  defaultActivitySettings,
  sanitizeActivity,
} from './bridge/limits.js';
export {
  LOG_LEVELS,
  LOG_SIZE_MAX_MB,
  LOG_SIZE_MIN_MB,
  defaultLoggingSettings,
  sanitizeLogging,
} from './logging.js';
export { setLogger, getLogger, type CoreLogger } from './logger.js';
export { BridgeService, type BridgeServiceOptions } from './bridge/service.js';
export { BRIDGE_ADAPTERS, listBridgeAdapters, getBridgeAdapter } from './bridge/registry.js';
export { computeActivityStats } from './bridge/stats.js';
export {
  LLM_PROVIDERS,
  defaultLlmSettings,
  getLlmPreset,
  isLlmConfigured,
  testLlmConnection,
  type LlmProviderPreset,
  type LlmTestResult,
} from './llm.js';
export {
  evaluateSkills,
  reviewCandidatePairs,
  evaluationSignature,
  buildCatalogEntries,
  buildPairs,
  extractJson,
  extractJsonCandidate,
  parseModelJson,
  defaultModelCaller,
  type ModelCaller,
  type ModelCallRequest,
  type EvaluateOptions,
  type EvaluationRunResult,
} from './evaluation/evaluate.js';
export { createEvaluationModel } from './evaluation/model.js';
export { applyVerdicts } from './evaluation/verdicts.js';
export {
  optimizeSkill,
  optimizationSignature,
  type OptimizeOptions,
} from './evaluation/optimize.js';
export {
  buildScoringPrompt,
  buildVerdictPrompt,
  buildSummaryPrompt,
  type CatalogPair,
  type CatalogSkill,
} from './evaluation/prompt.js';
export { checkForUpdate, compareVersions, type UpdateCheckResult } from './update.js';
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
  logsDir,
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
