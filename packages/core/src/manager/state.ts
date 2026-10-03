/**
 * Shared mutable state of `SkillManager`, plus the `RefreshOptions` input.
 * Extracted from the facade so the collaborators and the manager agree on one
 * shape without importing the class itself.
 */
import type {
  AiPairVerdict,
  EvaluationProgress,
  EvaluationReport,
  Finding,
  OrphanLock,
  SkillRecord,
} from '../types.js';

export interface ManagerState {
  loading: boolean;
  scannedAt: string | null;
  global: SkillRecord[];
  projects: Map<string, SkillRecord[]>;
  orphans: OrphanLock[];
  findings: Finding[];
  projectErrors: Map<string, string>;
  /** Rule-engine findings before AI verdicts are applied. */
  baseFindings: Finding[];
  /** Latest saved LLM evaluation, loaded from disk and refreshed on demand. */
  evaluation: EvaluationReport | null;
  verdicts: AiPairVerdict[];
  verdictsAt: string | null;
  verdictsSignature: string | null;
  evaluating: boolean;
  reviewing: boolean;
  evaluationProgress: EvaluationProgress | null;
  evaluationError: string | null;
}

export interface RefreshOptions {
  deep?: boolean;
  projectPaths?: string[];
}

export function createManagerState(): ManagerState {
  return {
    loading: false,
    scannedAt: null,
    global: [],
    projects: new Map(),
    orphans: [],
    findings: [],
    projectErrors: new Map(),
    baseFindings: [],
    evaluation: null,
    verdicts: [],
    verdictsAt: null,
    verdictsSignature: null,
    evaluating: false,
    reviewing: false,
    evaluationProgress: null,
    evaluationError: null,
  };
}
