/**
 * Applies AI pair verdicts to the rule-engine findings.
 *
 * Matching heuristic findings are annotated with the AI's conclusion; verdicts
 * that no heuristic flagged but the AI confirmed become new findings. Verdicts
 * never hide a finding — a false positive is annotated, not removed.
 */
import { sortFindings } from '../analysis.js';
import { recordKey } from '../keys.js';
import type {
  AiPairVerdict,
  AnalysisRule,
  EvaluationIssueKind,
  Finding,
  SkillRef,
} from '../types.js';

const AI_RULE: Record<EvaluationIssueKind, AnalysisRule> = {
  duplicate: 'ai-duplicate',
  conflict: 'ai-conflict',
  trigger: 'ai-trigger',
  boundary: 'ai-boundary',
  quality: 'ai-quality',
};

/** Unordered pair identity used to match verdicts with findings. */
export function pairKey(skills: SkillRef[]): string | null {
  if (skills.length !== 2) return null;
  const keys = skills.map((skill) => recordKey(skill)).sort();
  return `${keys[0]}|${keys[1]}`;
}

function aiFinding(verdict: AiPairVerdict): Finding {
  return {
    id: `ai:${verdict.pairKey}`,
    rule: AI_RULE[verdict.kind],
    severity: verdict.severity,
    confidence: 'ai',
    title: { code: 'finding.aiIssue.title', params: { title: verdict.title } },
    detail: { code: 'finding.aiIssue.detail', params: { detail: verdict.detail } },
    ...(verdict.suggestion
      ? {
          suggestion: {
            code: 'finding.aiIssue.suggestion' as const,
            params: { suggestion: verdict.suggestion },
          },
        }
      : {}),
    skills: verdict.skills,
    evidence: [],
    ai: { verdict: verdict.verdict, detail: verdict.detail, suggestion: verdict.suggestion },
  };
}

export function applyVerdicts(findings: Finding[], verdicts: AiPairVerdict[]): Finding[] {
  if (verdicts.length === 0) return findings;
  const byPair = new Map(verdicts.map((verdict) => [verdict.pairKey, verdict]));
  const matched = new Set<string>();
  const result = findings.map((finding) => {
    const key = pairKey(finding.skills);
    if (!key) return finding;
    const verdict = byPair.get(key);
    if (!verdict) return finding;
    matched.add(key);
    return {
      ...finding,
      ai: { verdict: verdict.verdict, detail: verdict.detail, suggestion: verdict.suggestion },
    };
  });
  for (const verdict of verdicts) {
    if (matched.has(verdict.pairKey) || verdict.verdict !== 'confirmed') continue;
    result.push(aiFinding(verdict));
  }
  return sortFindings(result);
}
