/**
 * Sidecar storage for data that must not touch skill directories: human
 * trigger annotations and the previous scan's content hashes.
 */
import { pairKey } from './evaluation/verdicts.js';
import { atomicWriteFile, ensureDir, readJsonSafe } from './fs-utils.js';
import { annotationsFilePath, evaluationFilePath, stateFilePath } from './paths.js';
import type {
  AiPairVerdict,
  AnnotationsFile,
  EvaluationIssueKind,
  EvaluationReport,
  EvaluationSeverity,
  EvaluationStore,
  ScanState,
  SkillRef,
} from './types.js';

/** Maps the pre-verdict persisted `issues` array onto confirmed verdicts. */
function legacyIssuesToVerdicts(raw: unknown): AiPairVerdict[] {
  if (!Array.isArray(raw)) return [];
  const verdicts: AiPairVerdict[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const issue = item as Record<string, unknown>;
    if (!Array.isArray(issue.skills) || issue.skills.length !== 2) continue;
    const skills = issue.skills as [SkillRef, SkillRef];
    const key = pairKey(skills);
    if (!key) continue;
    verdicts.push({
      pairKey: key,
      skills,
      kind: (issue.kind as EvaluationIssueKind) ?? 'duplicate',
      verdict: 'confirmed',
      severity: (issue.severity as EvaluationSeverity) ?? 'warn',
      title: typeof issue.title === 'string' ? issue.title : '',
      detail: typeof issue.detail === 'string' ? issue.detail : '',
      suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : null,
    });
  }
  return verdicts;
}

export class SidecarStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private get annotationsPath(): string {
    return annotationsFilePath(this.dir);
  }

  private get statePath(): string {
    return stateFilePath(this.dir);
  }

  private get evaluationPath(): string {
    return evaluationFilePath(this.dir);
  }

  async loadAnnotations(): Promise<AnnotationsFile> {
    const raw = await readJsonSafe<AnnotationsFile>(this.annotationsPath);
    if (!raw || typeof raw !== 'object') return {};
    return raw;
  }

  async saveAnnotations(annotations: AnnotationsFile): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(this.annotationsPath, `${JSON.stringify(annotations, null, 2)}\n`);
  }

  async loadState(): Promise<ScanState> {
    const raw = await readJsonSafe<ScanState>(this.statePath);
    if (!raw || typeof raw !== 'object' || typeof raw.hashes !== 'object' || raw.hashes === null) {
      return { hashes: {} };
    }
    return { hashes: raw.hashes };
  }

  async saveState(state: ScanState): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  async loadEvaluation(): Promise<EvaluationStore | null> {
    const raw = await readJsonSafe<unknown>(this.evaluationPath);
    if (!raw || typeof raw !== 'object') return null;
    const value = raw as Partial<EvaluationStore> & { scores?: unknown; issues?: unknown };

    // Legacy shape: the file used to be a bare EvaluationReport.
    if (Array.isArray(value.scores)) {
      const legacy = value as unknown as EvaluationReport;
      return {
        report: {
          generatedAt: legacy.generatedAt,
          provider: legacy.provider,
          model: legacy.model,
          locale: legacy.locale,
          signature: legacy.signature,
          summary: legacy.summary,
          averageScore: legacy.averageScore,
          scores: legacy.scores,
        },
        verdicts: legacyIssuesToVerdicts(value.issues),
        verdictsAt: legacy.generatedAt ?? null,
        verdictsSignature: legacy.signature ?? null,
      };
    }

    if (value.report === undefined && value.verdicts === undefined) return null;
    return {
      report: (value.report as EvaluationReport | null) ?? null,
      verdicts: Array.isArray(value.verdicts) ? (value.verdicts as AiPairVerdict[]) : [],
      verdictsAt: typeof value.verdictsAt === 'string' ? value.verdictsAt : null,
      verdictsSignature: typeof value.verdictsSignature === 'string' ? value.verdictsSignature : null,
    };
  }

  async saveEvaluation(store: EvaluationStore): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(this.evaluationPath, `${JSON.stringify(store, null, 2)}\n`);
  }
}
