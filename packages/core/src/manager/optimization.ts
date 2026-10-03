/**
 * Read-only skill optimization for `SkillManager`: runs the built-in optimizer
 * rubric over one skill, holds the result in memory, and tracks which skill is
 * currently being optimised.
 *
 * The AI call is gated on a configured model, mirroring the evaluation layer.
 *
 * The rubric is read from the shipped built-in skill on disk rather than from
 * the scanned catalog, so it stays available even when built-in skills are
 * hidden from the UI (`showInternal` off).
 */
import { join } from 'node:path';
import { toErrorMessage } from '../coerce.js';
import {
  optimizeSkill as runOptimization,
  optimizationSignature,
} from '../evaluation/optimize.js';
import { readFileSafe } from '../fs-utils.js';
import { isLlmConfigured } from '../llm.js';
import { getLogger } from '../logger.js';
import { recordKey } from '../keys.js';
import { parseFrontmatter } from '../skill.js';
import type { FetchLike } from '../cli/remote-search.js';
import type { ConfigStore } from '../config.js';
import type { ModelCaller } from '../evaluation/evaluate.js';
import type { SidecarStore } from '../sidecar.js';
import type { EvaluationLocale, SkillOptimization, SkillRecord } from '../types.js';
import type { ManagerState } from './state.js';

const OPTIMIZER_SKILL = 'skill-optimizer';

export interface OptimizationDeps {
  configStore: ConfigStore;
  sidecar: SidecarStore;
  state: ManagerState;
  modelCaller: ModelCaller | undefined;
  remoteFetch: () => FetchLike | null;
  /** App-shipped built-in skills dir; the optimizer rubric is loaded from it. */
  builtinSkillsDir: string | undefined;
  emit: () => void;
}

export class OptimizationController {
  constructor(private readonly deps: OptimizationDeps) {}

  /** Cached result for a skill, or null. */
  optimizationFor(record: SkillRecord): SkillOptimization | null {
    return this.deps.state.optimizations.get(recordKey(record)) ?? null;
  }

  /** Whether a cached result no longer matches the skill or model. */
  optimizationStale(record: SkillRecord): boolean {
    const saved = this.optimizationFor(record);
    if (!saved) return false;
    return saved.signature !== optimizationSignature(record, this.deps.configStore.value.llm);
  }

  /**
   * The built-in reviewer methodology, read straight from the shipped asset so
   * a same-named user skill can never be used as the rubric and the rubric is
   * independent of catalog visibility.
   */
  private async rubric(): Promise<string | undefined> {
    const dir = this.deps.builtinSkillsDir;
    if (!dir) return undefined;
    const raw = await readFileSafe(join(dir, OPTIMIZER_SKILL, 'SKILL.md'));
    if (raw === null) return undefined;
    const body = parseFrontmatter(raw).content.trim();
    return body || undefined;
  }

  async optimizeSkill(record: SkillRecord, locale: EvaluationLocale): Promise<SkillOptimization> {
    const { state, configStore, modelCaller } = this.deps;
    const settings = configStore.value.llm;
    if (!isLlmConfigured(settings)) throw new Error('LLM is not configured');

    const key = recordKey(record);
    state.optimizing = key;
    state.optimizationError = null;
    this.deps.emit();
    try {
      const result = await runOptimization({
        record,
        settings,
        locale,
        rubric: await this.rubric(),
        fetchImpl: this.deps.remoteFetch() ?? fetch,
        caller: modelCaller,
      });
      state.optimizations.set(key, result);
      await this.persist();
      return result;
    } catch (error) {
      state.optimizationError = toErrorMessage(error);
      getLogger().error('optimization failed', toErrorMessage(error));
      throw error;
    } finally {
      state.optimizing = null;
      this.deps.emit();
    }
  }

  private async persist(): Promise<void> {
    await this.deps.sidecar.saveOptimizer(Object.fromEntries(this.deps.state.optimizations));
  }
}
