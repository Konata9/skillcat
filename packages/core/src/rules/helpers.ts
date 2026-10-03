/**
 * Shared types and helpers for the analysis rule modules. Keeping them out of
 * `analysis.ts` lets each rule module be imported without pulling in the
 * registry (and avoids a rule ↔ registry import cycle).
 */
import type {
  Finding,
  FindingMessage,
  OrphanLock,
  SkillRecord,
  Thresholds,
} from '../types.js';

export { skillRef as ref } from '../keys.js';

export interface AnalysisContext {
  records: SkillRecord[];
  orphans: OrphanLock[];
  lastSeen: Record<string, string>;
  thresholds: Thresholds;
}

export type AnalysisRule = (ctx: AnalysisContext) => Finding[];

export function isSha256(value: string | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

export function message(code: FindingMessage['code'], params?: FindingMessage['params']): FindingMessage {
  return params ? { code, params } : { code };
}
