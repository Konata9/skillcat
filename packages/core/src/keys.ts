/**
 * Canonical identity helpers for skill records.
 *
 * A skill is uniquely identified by `scope + projectPath + name`. The scanner,
 * the analysis engine, the annotation sidecar and the UI must all derive that
 * identity the same way, so the derivation lives in exactly one place.
 *
 * `annotationKey` extends the identity with the content hash: annotations are
 * keyed per content revision and therefore expire automatically when a skill
 * changes on disk.
 *
 * This module is deliberately dependency-free (type-only imports), which makes
 * it safe to import from browser contexts via the `@skillcat/core/keys`
 * subpath export.
 */
import type { SkillRecord, SkillRef } from './types.js';

/** `scope|projectPath|name` identity for a skill, before hashing. */
export function scopeNameKey(
  scope: SkillRef['scope'],
  projectPath: string | undefined,
  name: string,
): string {
  return `${scope}|${projectPath ?? ''}|${name}`;
}

export function recordKey(record: Pick<SkillRecord, 'scope' | 'projectPath' | 'name'>): string {
  return scopeNameKey(record.scope, record.projectPath, record.name);
}

export function annotationKey(
  record: Pick<SkillRecord, 'scope' | 'projectPath' | 'name' | 'contentHash'>,
): string {
  return `${recordKey(record)}|${record.contentHash}`;
}

/** Order-independent key for a pair of labels (skill names or catalog ids). */
export function unorderedPairKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** Unordered pair identity used to match verdicts with findings. */
export function pairKey(skills: SkillRef[]): string | null {
  if (skills.length !== 2) return null;
  const keys = skills.map((skill) => recordKey(skill)).sort();
  return `${keys[0]}|${keys[1]}`;
}
