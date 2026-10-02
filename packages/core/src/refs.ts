/**
 * Skill identity snapshot. Rules and the evaluation layer both reference skills
 * by these fields, so the projection lives in one place.
 */
import type { SkillRecord, SkillRef } from './types.js';

export function skillRef(record: SkillRecord): SkillRef {
  return {
    name: record.name,
    scope: record.scope,
    projectPath: record.projectPath,
    path: record.path,
  };
}
