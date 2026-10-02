/**
 * Deterministic and heuristic analysis over scanned skill records.
 *
 * The engine is a registry of independent rule modules (see `rules/`); each
 * rule receives the same context and returns findings. Adding a rule means
 * adding one module and appending it to `ANALYSIS_RULES` — no edits to the
 * engine. Findings are sorted once at the end so rule order never leaks into
 * the result.
 */
import { sortFindings } from './findings.js';
import {
  copyDriftRule,
  danglingLinkRule,
  declaredLinkMissingRule,
  descriptionLintRule,
  dirMissingLockRule,
  localModifiedRule,
} from './rules/records.js';
import { lockMissingDirRule, shadowingRule } from './rules/scopes.js';
import {
  duplicateContentRule,
  negativeContradictionRule,
  triggerOverlapRule,
} from './rules/similarity.js';
import type { AnalysisContext, AnalysisRule } from './rules/helpers.js';
import type { Finding } from './types.js';

export type AnalysisInput = AnalysisContext;

/** Rule registry. Append a rule module here to enable it. */
export const ANALYSIS_RULES: AnalysisRule[] = [
  danglingLinkRule,
  dirMissingLockRule,
  copyDriftRule,
  localModifiedRule,
  declaredLinkMissingRule,
  descriptionLintRule,
  lockMissingDirRule,
  shadowingRule,
  triggerOverlapRule,
  negativeContradictionRule,
  duplicateContentRule,
];

export function analyzeSkills(input: AnalysisInput): Finding[] {
  const findings: Finding[] = [];
  for (const rule of ANALYSIS_RULES) findings.push(...rule(input));
  return sortFindings(findings);
}
