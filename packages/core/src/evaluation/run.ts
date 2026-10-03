/**
 * LLM skill evaluation: scores every scanned skill, then judges pre-filtered
 * candidate pairs for duplication/conflicts, and finally writes an overview.
 * IO-free orchestration over the pure helpers in `candidates` / `normalize`
 * and the tolerant parser in `json`.
 */
import { createHash } from 'node:crypto';
import { streamText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { FetchLike } from '../cli/remote-search.js';
import { pairKey, recordKey, skillRef } from '../keys.js';
import type {
  AiPairVerdict,
  EvaluationEvent,
  EvaluationLocale,
  EvaluationProgress,
  EvaluationReport,
  EvaluationSkillScore,
  LlmSettings,
  SkillRecord,
  SkillRef,
} from '../types.js';
import { buildCatalogEntries, buildPairs, chunkSkills } from './candidates.js';
import { callModel, parseModelJson, type ModelCaller, type ModelCallRequest } from './json.js';
import { createEvaluationModel } from './model.js';
import {
  clampScore,
  cleanList,
  normalizeGrade,
  normalizeKind,
  normalizeSeverity,
  normalizeVerdict,
  replaceSkillIds,
  skillNames,
} from './normalize.js';
import {
  buildScoringPrompt,
  buildSummaryPrompt,
  buildVerdictPrompt,
  type CatalogPair,
  type CatalogSkill,
} from './prompt.js';

const MAX_OUTPUT_TOKENS = 4096;

// Precise schemas are sent to the model; the envelope schemas validate the
// response tolerantly so a truncated last element can be dropped, not fatal.
const ScoreEntrySchema = z.object({
  id: z.string(),
  score: z.number(),
  grade: z.string().optional(),
  summary: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  issues: z.array(z.string()).optional(),
});
const ScoringResponseSchema = z.object({ scores: z.array(ScoreEntrySchema) });
const ScoringEnvelopeSchema = z.object({ scores: z.array(z.unknown()) });

const VerdictEntrySchema = z.object({
  a: z.string(),
  b: z.string(),
  kind: z.string(),
  verdict: z.string().optional(),
  severity: z.string().optional(),
  title: z.string().optional(),
  detail: z.string().optional(),
  suggestion: z.string().optional(),
});
const VerdictResponseSchema = z.object({ verdicts: z.array(VerdictEntrySchema) });
const VerdictEnvelopeSchema = z.object({ verdicts: z.array(z.unknown()) });

const SummaryResponseSchema = z.object({ summary: z.string() });
const SummaryEnvelopeSchema = z.object({ summary: z.string().optional() });

/**
 * Default caller: streams the completion so reasoning deltas can be surfaced
 * live, accumulates the text, and parses it with the tolerant JSON parser. The
 * JSON schema is carried by the prompt, so plain streaming stays portable
 * across every provider.
 */
export const defaultModelCaller: ModelCaller = async ({
  model,
  system,
  prompt,
  signal,
  onReasoning,
}) => {
  const result = streamText({
    model,
    system,
    prompt,
    maxRetries: 1,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: signal,
  });
  let text = '';
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
    } else if (part.type === 'reasoning-delta') {
      onReasoning?.(part.text);
    } else if (part.type === 'error') {
      throw part.error instanceof Error ? part.error : new Error(String(part.error));
    }
  }
  return await parseModelJson(text);
};

export function evaluationSignature(records: SkillRecord[], settings: LlmSettings): string {
  const payload = JSON.stringify({
    model: `${settings.provider}:${settings.model}`,
    skills: records.map((record) => `${recordKey(record)}@${record.contentHash}`).sort(),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export interface EvaluateOptions {
  records: SkillRecord[];
  settings: LlmSettings;
  locale: EvaluationLocale;
  fetchImpl?: FetchLike;
  caller?: ModelCaller;
  onProgress?: (progress: EvaluationProgress) => void;
  /** Live process log: synthetic steps plus streamed model reasoning. */
  onEvent?: (event: EvaluationEvent) => void;
  signal?: AbortSignal;
  now?: () => Date;
}

export interface EvaluationRunResult {
  report: EvaluationReport;
  verdicts: AiPairVerdict[];
}

interface JudgeContext {
  model: LanguageModel;
  caller: ModelCaller;
  locale: EvaluationLocale;
  signal?: AbortSignal;
  onEvent?: (event: EvaluationEvent) => void;
  onReasoning: (text: string) => void;
}

async function judgePairs(
  context: JudgeContext,
  catalog: CatalogSkill[],
  pairs: CatalogPair[],
  records: SkillRecord[],
): Promise<AiPairVerdict[]> {
  if (pairs.length === 0) return [];
  context.onEvent?.({
    type: 'step',
    step: { code: 'eval.step.pairs', params: { count: pairs.length } },
  });
  context.onEvent?.({ type: 'step', step: { code: 'eval.step.judging' } });
  const recordById = new Map(catalog.map((skill, index) => [skill.id, records[index]!]));
  const names = skillNames(catalog, records);
  try {
    const { system, prompt } = buildVerdictPrompt({ locale: context.locale, pairs, skills: catalog });
    const raw = await callModel(context.caller, {
      model: context.model,
      system,
      prompt,
      schema: VerdictResponseSchema,
      signal: context.signal,
      onReasoning: context.onReasoning,
    });
    const envelope = VerdictEnvelopeSchema.safeParse(raw);
    if (!envelope.success) return [];
    const verdicts: AiPairVerdict[] = [];
    for (const entry of envelope.data.verdicts) {
      const result = VerdictEntrySchema.safeParse(entry);
      if (!result.success) continue;
      const a = recordById.get(result.data.a);
      const b = recordById.get(result.data.b);
      if (!a || !b) continue;
      const skills: [SkillRef, SkillRef] = [skillRef(a), skillRef(b)];
      const key = pairKey(skills);
      if (!key) continue;
      verdicts.push({
        pairKey: key,
        skills,
        kind: normalizeKind(result.data.kind),
        verdict: normalizeVerdict(result.data.verdict),
        severity: normalizeSeverity(result.data.severity),
        title: replaceSkillIds((result.data.title ?? '').trim(), names),
        detail: replaceSkillIds((result.data.detail ?? '').trim(), names),
        suggestion: result.data.suggestion?.trim()
          ? replaceSkillIds(result.data.suggestion.trim(), names)
          : null,
      });
    }
    return verdicts;
  } catch {
    // Pair judgement is best-effort; scores are still useful without it.
    return [];
  }
}

/** Reviews only the heuristic candidate pairs; backs the review button. */
export async function reviewCandidatePairs(options: EvaluateOptions): Promise<AiPairVerdict[]> {
  const { records, settings, locale } = options;
  if (records.length === 0) throw new Error('no skills to evaluate');
  const model = createEvaluationModel(settings, options.fetchImpl);
  const caller = options.caller ?? defaultModelCaller;
  const catalog = buildCatalogEntries(records);
  const pairs = buildPairs(records, catalog);
  const onReasoning = (text: string) => options.onEvent?.({ type: 'reasoning', text });
  options.onEvent?.({ type: 'start' });
  options.onEvent?.({
    type: 'step',
    step: { code: 'eval.step.review', params: { count: pairs.length } },
  });
  return judgePairs(
    { model, caller, locale, signal: options.signal, onEvent: options.onEvent, onReasoning },
    catalog,
    pairs,
    records,
  );
}

export async function evaluateSkills(options: EvaluateOptions): Promise<EvaluationRunResult> {
  const { records, settings, locale } = options;
  if (records.length === 0) throw new Error('no skills to evaluate');
  const model = createEvaluationModel(settings, options.fetchImpl);
  const caller = options.caller ?? defaultModelCaller;
  const catalog = buildCatalogEntries(records);
  const recordById = new Map(catalog.map((skill, index) => [skill.id, records[index]!]));
  const names = skillNames(catalog, records);
  const batches = chunkSkills(catalog);
  const pairs = buildPairs(records, catalog);
  const total = batches.length + (pairs.length > 0 ? 1 : 0) + 1;
  let done = 0;
  const emit = () => options.onProgress?.({ done, total });

  const onReasoning = (text: string) => options.onEvent?.({ type: 'reasoning', text });
  options.onEvent?.({ type: 'start' });
  options.onEvent?.({
    type: 'step',
    step: { code: 'eval.step.prepare', params: { count: records.length } },
  });

  const scores: EvaluationSkillScore[] = [];
  let lastError: unknown = null;
  for (const [index, batch] of batches.entries()) {
    try {
      options.onEvent?.({
        type: 'step',
        step: {
          code: 'eval.step.scoring',
          params: {
            index: index + 1,
            total: batches.length,
            names: batch.map((skill) => skill.name).join(locale === 'zh' ? '、' : ', '),
          },
        },
      });
      const { system, prompt } = buildScoringPrompt({ locale, skills: batch });
      const raw = await callModel(caller, {
        model,
        system,
        prompt,
        schema: ScoringResponseSchema,
        signal: options.signal,
        onReasoning,
      });
      const envelope = ScoringEnvelopeSchema.safeParse(raw);
      if (!envelope.success) throw new Error('model response did not contain a "scores" array');
      for (const entry of envelope.data.scores) {
        const result = ScoreEntrySchema.safeParse(entry);
        if (!result.success) continue;
        const record = recordById.get(result.data.id);
        if (!record) continue;
        scores.push({
          skill: skillRef(record),
          score: clampScore(result.data.score),
          grade: normalizeGrade(result.data.grade, result.data.score),
          summary: replaceSkillIds((result.data.summary ?? '').trim(), names),
          strengths: cleanList(result.data.strengths).map((item) => replaceSkillIds(item, names)),
          issues: cleanList(result.data.issues).map((item) => replaceSkillIds(item, names)),
        });
      }
    } catch (error) {
      // One bad batch should not discard the batches that succeeded.
      lastError = error;
    }
    done += 1;
    emit();
  }
  if (scores.length === 0) {
    throw lastError instanceof Error
      ? lastError
      : new Error('evaluation produced no scores; check the model output');
  }

  const verdicts = await judgePairs(
    { model, caller, locale, signal: options.signal, onEvent: options.onEvent, onReasoning },
    catalog,
    pairs,
    records,
  );
  if (pairs.length > 0) {
    done += 1;
    emit();
  }

  scores.sort((a, b) => a.score - b.score || a.skill.name.localeCompare(b.skill.name));
  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length)
    : 0;

  options.onEvent?.({ type: 'step', step: { code: 'eval.step.summary' } });
  let summary = '';
  try {
    const summaryRequest = buildSummaryPrompt({ locale, scores, verdicts });
    const summaryRaw = await callModel(caller, {
      model,
      system: summaryRequest.system,
      prompt: summaryRequest.prompt,
      schema: SummaryResponseSchema,
      signal: options.signal,
      onReasoning,
    });
    const parsed = SummaryEnvelopeSchema.safeParse(summaryRaw);
    if (parsed.success) summary = replaceSkillIds((parsed.data.summary ?? '').trim(), names);
  } catch {
    // The overview can fall back to scores-only when the summary call fails.
  }
  done += 1;
  emit();

  return {
    report: {
      generatedAt: (options.now?.() ?? new Date()).toISOString(),
      provider: settings.provider,
      model: settings.model,
      locale,
      signature: evaluationSignature(records, settings),
      summary,
      averageScore,
      scores,
    },
    verdicts,
  };
}
