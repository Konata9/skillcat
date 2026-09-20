/**
 * Analysis findings and doctor diagnostics.
 *
 * Every user-facing string is a message code plus params, never prose: the UI
 * layer owns translation and has a compile-time guarantee that each code has a
 * dictionary entry.
 */
import type { SkillRef } from './domain.js';

export type Severity = 'error' | 'warn' | 'info';
export type Confidence = 'deterministic' | 'heuristic' | 'ai';

/** Outcome of an AI review of a heuristic candidate pair. */
export type AiVerdict = 'confirmed' | 'false-positive' | 'uncertain';

export type AnalysisRule =
  | 'dangling-link'
  | 'lock-missing-dir'
  | 'dir-missing-lock'
  | 'copy-drift'
  | 'local-modified'
  | 'shadowing'
  | 'source-conflict'
  | 'declared-link-missing'
  | 'trigger-overlap'
  | 'negative-contradiction'
  | 'duplicate-content'
  | 'description-lint'
  | 'ai-duplicate'
  | 'ai-conflict'
  | 'ai-trigger'
  | 'ai-boundary'
  | 'ai-quality';

/** Every user-facing finding string is a message code resolved by the UI layer. */
export type FindingCode =
  | 'finding.danglingLink.title'
  | 'finding.danglingLink.detail'
  | 'finding.danglingLink.suggestion'
  | 'finding.dirMissingLock.title'
  | 'finding.dirMissingLock.detail'
  | 'finding.dirMissingLock.suggestion'
  | 'finding.copyDrift.title'
  | 'finding.copyDrift.detail'
  | 'finding.copyDrift.suggestion'
  | 'finding.localModifiedHash.title'
  | 'finding.localModifiedHash.detail'
  | 'finding.localModifiedHash.suggestion'
  | 'finding.localModifiedScan.title'
  | 'finding.localModifiedScan.detail'
  | 'finding.localModifiedScan.suggestion'
  | 'finding.declaredLinkMissing.title'
  | 'finding.declaredLinkMissing.detail'
  | 'finding.declaredLinkMissing.suggestion'
  | 'finding.declaredLinkMissing.suggestionNoAgent'
  | 'finding.descriptionLint.title'
  | 'finding.descriptionLint.detail'
  | 'finding.descriptionLint.suggestion'
  | 'finding.descriptionLint.missingDescription'
  | 'finding.descriptionLint.shortDescription'
  | 'finding.descriptionLint.noWhenSignal'
  | 'finding.lockMissingDir.title'
  | 'finding.lockMissingDir.detail'
  | 'finding.lockMissingDir.suggestion'
  | 'finding.shadowing.title'
  | 'finding.shadowing.detail'
  | 'finding.shadowing.suggestion'
  | 'finding.sourceConflict.title'
  | 'finding.sourceConflict.detail'
  | 'finding.sourceConflict.suggestion'
  | 'finding.triggerOverlap.title'
  | 'finding.triggerOverlap.detail'
  | 'finding.triggerOverlap.detailNoShared'
  | 'finding.triggerOverlap.suggestion'
  | 'finding.negativeContradiction.title'
  | 'finding.negativeContradiction.detail'
  | 'finding.negativeContradiction.suggestion'
  | 'finding.duplicateContent.title'
  | 'finding.duplicateContent.detail'
  | 'finding.duplicateContent.suggestion'
  | 'finding.aiIssue.title'
  | 'finding.aiIssue.detail'
  | 'finding.aiIssue.suggestion';

export type FindingParam = string | number | FindingMessage | FindingParam[];

export interface FindingMessage {
  code: FindingCode;
  params?: Record<string, FindingParam>;
}

/** AI review attached to a heuristic finding, or to an AI-only finding. */
export interface FindingAiNote {
  verdict: AiVerdict;
  detail: string;
  suggestion: string | null;
}

export interface Finding {
  id: string;
  rule: AnalysisRule;
  severity: Severity;
  confidence: Confidence;
  title: FindingMessage;
  detail: FindingMessage;
  suggestion?: FindingMessage;
  skills: SkillRef[];
  evidence: string[];
  score?: number;
  /** Present when the AI reviewed this candidate (or produced the finding). */
  ai?: FindingAiNote;
}

export type DoctorWarningCode =
  | 'doctor.noRoots'
  | 'doctor.cliUnavailable'
  | 'doctor.cliVersionFailed'
  | 'doctor.invalidProxy';

export interface DoctorWarning {
  code: DoctorWarningCode;
  params?: Record<string, FindingParam>;
}

export interface DoctorReport {
  ok: boolean;
  configDir: string;
  cli: {
    command: string[] | null;
    version: string | null;
    error?: string;
  };
  /** Normalized proxy URL in effect for CLI child processes, or null when direct. */
  proxy: string | null;
  lockFiles: Array<{
    path: string;
    ok: boolean;
    error?: string;
    count?: number;
  }>;
  warnings: DoctorWarning[];
}
