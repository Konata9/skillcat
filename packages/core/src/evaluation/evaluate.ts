/**
 * Barrel for the LLM evaluation pipeline.
 *
 * The implementation is split by concern: `json` owns tolerant model-output
 * parsing, `candidates` builds the catalog and candidate pairs, `normalize`
 * coerces untrusted model enums, and `run` orchestrates the scoring / judging /
 * summary passes. This barrel keeps the historical import path stable.
 */
export {
  extractJson,
  extractJsonCandidate,
  parseModelJson,
  type ModelCaller,
  type ModelCallRequest,
} from './json.js';
export { buildCatalogEntries, buildPairs } from './candidates.js';
export {
  evaluateSkills,
  reviewCandidatePairs,
  evaluationSignature,
  defaultModelCaller,
  type EvaluateOptions,
  type EvaluationRunResult,
} from './run.js';
