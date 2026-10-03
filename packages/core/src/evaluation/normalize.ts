/**
 * Normalization of untrusted model output into the evaluation union types.
 * Models answer with free strings, so every enum-ish field is coerced to a
 * known value and scores/grades are clamped into range.
 */
import type { SkillRecord } from '../types.js';
import type { AiVerdict, EvaluationGrade, EvaluationIssueKind, EvaluationSeverity } from '../types.js';
import type { CatalogSkill } from './prompt.js';

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeGrade(grade: unknown, score: number): EvaluationGrade {
  const value = typeof grade === 'string' ? grade.trim().toUpperCase() : '';
  if (value === 'A' || value === 'B' || value === 'C' || value === 'D') return value;
  const safe = clampScore(score);
  if (safe >= 90) return 'A';
  if (safe >= 75) return 'B';
  if (safe >= 60) return 'C';
  return 'D';
}

export function normalizeKind(kind: string): EvaluationIssueKind {
  const value = kind.trim().toLowerCase();
  if (
    value === 'duplicate' ||
    value === 'conflict' ||
    value === 'quality' ||
    value === 'trigger' ||
    value === 'boundary'
  ) {
    return value;
  }
  return 'quality';
}

export function normalizeSeverity(severity: unknown): EvaluationSeverity {
  const value = typeof severity === 'string' ? severity.trim().toLowerCase() : '';
  if (value === 'error' || value === 'warn' || value === 'info') return value;
  return 'warn';
}

export function normalizeVerdict(verdict: unknown): AiVerdict {
  const value = typeof verdict === 'string' ? verdict.trim().toLowerCase() : '';
  if (value === 'confirmed' || value === 'false-positive' || value === 'uncertain') return value;
  return 'uncertain';
}

export function cleanList(list: string[] | undefined): string[] {
  return (list ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

/**
 * Models occasionally echo the catalog ids (`s1`, `s45`) in prose. Rewrite any
 * such reference to the skill's name so the report reads naturally.
 */
export function replaceSkillIds(text: string, names: Map<string, string>): string {
  if (!text) return text;
  // `(?![\w-])` avoids mangling real names like "s3-upload".
  return text.replace(/\bs\s?(\d+)(?![\w-])/gi, (match, digits: string) => names.get(`s${digits}`) ?? match);
}

export function skillNames(catalog: CatalogSkill[], records: SkillRecord[]): Map<string, string> {
  return new Map(catalog.map((skill, index) => [skill.id, records[index]?.name ?? skill.name]));
}
