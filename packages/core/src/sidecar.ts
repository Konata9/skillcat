/**
 * Sidecar storage for data that must not touch skill directories: human
 * trigger annotations and the previous scan's content hashes.
 */
import { atomicWriteFile, ensureDir, readJsonSafe } from './fs-utils.js';
import { pairKey } from './keys.js';
import { annotationsFilePath, evaluationFilePath, optimizerFilePath, stateFilePath } from './paths.js';
import type {
  AiPairVerdict,
  AnnotationsFile,
  EvaluationIssueKind,
  EvaluationReport,
  EvaluationSeverity,
  EvaluationStore,
  OptimizerStore,
  ScanState,
  SkillOptimization,
  SkillRef,
} from './types.js';

const ISSUE_KINDS: readonly EvaluationIssueKind[] = [
  'duplicate',
  'conflict',
  'quality',
  'trigger',
  'boundary',
];
const SEVERITIES: readonly EvaluationSeverity[] = ['error', 'warn', 'info'];

function toIssueKind(value: unknown): EvaluationIssueKind {
  return typeof value === 'string' && (ISSUE_KINDS as readonly string[]).includes(value)
    ? (value as EvaluationIssueKind)
    : 'duplicate';
}

function toSeverity(value: unknown): EvaluationSeverity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value)
    ? (value as EvaluationSeverity)
    : 'warn';
}

/**
 * Validates one persisted verdict. A corrupted `evaluation.json` must not leak
 * invalid `kind`/`severity` union values into the findings pipeline.
 */
function sanitizeVerdict(raw: unknown): AiPairVerdict | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const verdict = raw as Record<string, unknown>;
  if (!Array.isArray(verdict.skills) || verdict.skills.length !== 2) return null;
  const skills = verdict.skills as [SkillRef, SkillRef];
  const key = pairKey(skills);
  if (!key) return null;
  const rawVerdict = verdict.verdict;
  return {
    pairKey: key,
    skills,
    kind: toIssueKind(verdict.kind),
    verdict:
      rawVerdict === 'confirmed' || rawVerdict === 'false-positive' || rawVerdict === 'uncertain'
        ? rawVerdict
        : 'uncertain',
    severity: toSeverity(verdict.severity),
    title: typeof verdict.title === 'string' ? verdict.title : '',
    detail: typeof verdict.detail === 'string' ? verdict.detail : '',
    suggestion: typeof verdict.suggestion === 'string' ? verdict.suggestion : null,
  };
}

function sanitizeVerdicts(raw: unknown): AiPairVerdict[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(sanitizeVerdict)
    .filter((verdict): verdict is AiPairVerdict => verdict !== null);
}

/** Maps the pre-verdict persisted `issues` array onto confirmed verdicts. */
function legacyIssuesToVerdicts(raw: unknown): AiPairVerdict[] {
  return sanitizeVerdicts(raw).map((verdict) => ({ ...verdict, verdict: 'confirmed' }));
}

/**
 * Drops corrupted entries from a persisted optimizer store: a bad file must
 * never crash the detail view.
 */
function sanitizeOptimizer(raw: unknown): OptimizerStore {
  if (!raw || typeof raw !== 'object') return {};
  const store: OptimizerStore = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Partial<SkillOptimization>;
    if (!entry.skill || typeof entry.skill.name !== 'string' || !Array.isArray(entry.suggestions)) {
      continue;
    }
    store[key] = value as SkillOptimization;
  }
  return store;
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

  private get optimizerPath(): string {
    return optimizerFilePath(this.dir);
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
      verdicts: sanitizeVerdicts(value.verdicts),
      verdictsAt: typeof value.verdictsAt === 'string' ? value.verdictsAt : null,
      verdictsSignature: typeof value.verdictsSignature === 'string' ? value.verdictsSignature : null,
    };
  }

  async saveEvaluation(store: EvaluationStore): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(this.evaluationPath, `${JSON.stringify(store, null, 2)}\n`);
  }

  async loadOptimizer(): Promise<OptimizerStore> {
    const raw = await readJsonSafe<unknown>(this.optimizerPath);
    return sanitizeOptimizer(raw);
  }

  async saveOptimizer(store: OptimizerStore): Promise<void> {
    await ensureDir(this.dir);
    await atomicWriteFile(this.optimizerPath, `${JSON.stringify(store, null, 2)}\n`);
  }
}
