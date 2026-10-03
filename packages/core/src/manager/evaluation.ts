/**
 * LLM evaluation orchestration for `SkillManager`: staleness checks, the live
 * process-log sink, persistence of the report/verdicts, and the two run entry
 * points. Extracted from the facade so the scoring pipeline and the manager
 * state stay decoupled.
 */
import { toErrorMessage } from '../coerce.js';
import {
  evaluateSkills,
  reviewCandidatePairs,
  type ModelCaller,
} from '../evaluation/evaluate.js';
import { isLlmConfigured } from '../llm.js';
import { getLogger } from '../logger.js';
import type { ConfigStore } from '../config.js';
import type { FetchLike } from '../cli/remote-search.js';
import type { SidecarStore } from '../sidecar.js';
import type { EvaluationEvent, EvaluationLocale, SkillRecord } from '../types.js';
import type { ManagerState } from './state.js';

export interface EvaluationDeps {
  configStore: ConfigStore;
  sidecar: SidecarStore;
  state: ManagerState;
  /** Test seam overriding the model transport. */
  modelCaller: ModelCaller | undefined;
  remoteFetch: () => FetchLike | null;
  allRecords: () => SkillRecord[];
  emit: () => void;
  emitEvaluation: (event: EvaluationEvent) => void;
  currentSignature: () => string | null;
  rebuildFindings: () => void;
}

export class EvaluationController {
  constructor(private readonly deps: EvaluationDeps) {}

  /** Whether the saved evaluation no longer matches the scanned skills. */
  evaluationStale(): boolean {
    const report = this.deps.state.evaluation;
    if (!report) return false;
    const signature = this.deps.currentSignature();
    return signature !== null && signature !== report.signature;
  }

  /** Whether the saved AI verdicts no longer match the scanned skills. */
  verdictsStale(): boolean {
    if (this.deps.state.verdicts.length === 0 || !this.deps.state.verdictsSignature) return false;
    const signature = this.deps.currentSignature();
    return signature !== null && signature !== this.deps.state.verdictsSignature;
  }

  private async saveEvaluationStore(): Promise<void> {
    await this.deps.sidecar.saveEvaluation({
      report: this.deps.state.evaluation,
      verdicts: this.deps.state.verdicts,
      verdictsAt: this.deps.state.verdictsAt,
      verdictsSignature: this.deps.state.verdictsSignature,
    });
  }

  /**
   * Coalesces per-token reasoning deltas so the renderer is not flooded with
   * one broadcast per character.
   */
  private createEventSink(): { onEvent: (event: EvaluationEvent) => void; flush: () => void } {
    let reasoningBuffer = '';
    const flush = () => {
      if (!reasoningBuffer) return;
      this.deps.emitEvaluation({ type: 'reasoning', text: reasoningBuffer });
      reasoningBuffer = '';
    };
    const onEvent = (event: EvaluationEvent) => {
      if (event.type === 'reasoning') {
        reasoningBuffer += event.text ?? '';
        if (reasoningBuffer.length >= 160) flush();
        return;
      }
      flush();
      this.deps.emitEvaluation(event);
    };
    return { onEvent, flush };
  }

  /**
   * Runs the LLM evaluation over every scanned skill and saves the report plus
   * the AI pair verdicts. Only called explicitly (button press).
   */
  async runEvaluation(locale: EvaluationLocale): Promise<void> {
    const { state, configStore, modelCaller } = this.deps;
    const settings = configStore.value.llm;
    if (!isLlmConfigured(settings)) throw new Error('LLM is not configured');
    const records = this.deps.allRecords();
    if (records.length === 0) throw new Error('no skills to evaluate');

    state.evaluating = true;
    state.evaluationProgress = { done: 0, total: 0 };
    state.evaluationError = null;
    this.deps.emit();

    const sink = this.createEventSink();
    try {
      const { report, verdicts } = await evaluateSkills({
        records,
        settings,
        locale,
        fetchImpl: this.deps.remoteFetch() ?? fetch,
        caller: modelCaller,
        onEvent: sink.onEvent,
        onProgress: (progress) => {
          state.evaluationProgress = progress;
          this.deps.emit();
        },
      });
      state.evaluation = report;
      state.verdicts = verdicts;
      state.verdictsAt = report.generatedAt;
      state.verdictsSignature = report.signature;
      this.deps.rebuildFindings();
      await this.saveEvaluationStore();
    } catch (error) {
      state.evaluationError = toErrorMessage(error);
      getLogger().error('evaluation failed', toErrorMessage(error));
      throw error;
    } finally {
      sink.flush();
      this.deps.emitEvaluation({ type: 'done' });
      state.evaluating = false;
      state.evaluationProgress = null;
      this.deps.emit();
    }
  }

  /**
   * Reviews only the heuristic candidate pairs and updates the AI verdicts,
   * keeping the existing report. Backs the "review candidates" button.
   */
  async runCandidateReview(locale: EvaluationLocale): Promise<void> {
    const { state, configStore, modelCaller } = this.deps;
    const settings = configStore.value.llm;
    if (!isLlmConfigured(settings)) throw new Error('LLM is not configured');
    const records = this.deps.allRecords();
    if (records.length === 0) throw new Error('no skills to evaluate');

    state.reviewing = true;
    state.evaluationProgress = null;
    state.evaluationError = null;
    this.deps.emit();

    const sink = this.createEventSink();
    try {
      const verdicts = await reviewCandidatePairs({
        records,
        settings,
        locale,
        fetchImpl: this.deps.remoteFetch() ?? fetch,
        caller: modelCaller,
        onEvent: sink.onEvent,
      });
      state.verdicts = verdicts;
      state.verdictsAt = new Date().toISOString();
      state.verdictsSignature = this.deps.currentSignature();
      this.deps.rebuildFindings();
      await this.saveEvaluationStore();
    } catch (error) {
      state.evaluationError = toErrorMessage(error);
      getLogger().error('candidate review failed', toErrorMessage(error));
      throw error;
    } finally {
      sink.flush();
      this.deps.emitEvaluation({ type: 'done' });
      state.reviewing = false;
      state.evaluationProgress = null;
      this.deps.emit();
    }
  }

}
