/**
 * Finding ordering shared by the rule engine and the AI verdict layer, kept
 * out of `analysis.ts` so the evaluation layer can sort without depending on
 * the rule engine.
 */
import type { Finding, Severity } from './types.js';

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/** Shared ordering so rule findings and AI-annotated findings stay consistent. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (b.score ?? 0) - (a.score ?? 0) ||
      a.title.code.localeCompare(b.title.code) ||
      a.id.localeCompare(b.id),
  );
}
