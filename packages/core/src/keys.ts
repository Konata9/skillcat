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
import type { SkillRecord } from './types.js';

export function recordKey(record: Pick<SkillRecord, 'scope' | 'projectPath' | 'name'>): string {
  return `${record.scope}|${record.projectPath ?? ''}|${record.name}`;
}

export function annotationKey(
  record: Pick<SkillRecord, 'scope' | 'projectPath' | 'name' | 'contentHash'>,
): string {
  return `${recordKey(record)}|${record.contentHash}`;
}
