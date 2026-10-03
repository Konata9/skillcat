/**
 * Read-only skill optimization: asks the model for actionable suggestions on a
 * single skill, following the built-in `skill-optimizer` rubric when available.
 *
 * The result is never written to disk by SkillCat; the manager holds it in
 * memory and the UI renders it. The pipeline mirrors the evaluation layer:
 * injectable model caller + tolerant JSON parsing.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FetchLike } from '../cli/remote-search.js';
import { recordKey, skillRef } from '../keys.js';
import type {
  EvaluationLocale,
  LlmSettings,
  OptimizationSeverity,
  OptimizationSuggestion,
  SkillOptimization,
  SkillRecord,
} from '../types.js';
import { buildCatalogEntries } from './candidates.js';
import { callModel, type ModelCaller } from './json.js';
import { createEvaluationModel } from './model.js';
import { buildOptimizePrompt } from './prompt.js';
import { defaultModelCaller } from './run.js';

const MAX_SUGGESTIONS = 8;

const SuggestionSchema = z.object({
  title: z.string(),
  severity: z.string().optional(),
  rationale: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
});
const OptimizeEnvelopeSchema = z.object({
  summary: z.string().optional(),
  suggestions: z.array(z.unknown()).optional(),
});

function normalizeSeverity(value: unknown): OptimizationSeverity {
  const severity = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (severity === 'high' || severity === 'medium' || severity === 'low') return severity;
  return 'medium';
}

/** Fingerprint of the optimized input (skill content + model). */
export function optimizationSignature(record: SkillRecord, settings: LlmSettings): string {
  return createHash('sha256')
    .update(`${settings.provider}:${settings.model}|${recordKey(record)}@${record.contentHash}`)
    .digest('hex');
}

export interface OptimizeOptions {
  record: SkillRecord;
  settings: LlmSettings;
  locale: EvaluationLocale;
  /** Built-in reviewer methodology; omitted when no built-in skill is shipped. */
  rubric?: string;
  fetchImpl?: FetchLike;
  caller?: ModelCaller;
  now?: () => Date;
}

export async function optimizeSkill(options: OptimizeOptions): Promise<SkillOptimization> {
  const { record, settings, locale, rubric } = options;
  const model = createEvaluationModel(settings, options.fetchImpl);
  const caller = options.caller ?? defaultModelCaller;
  const catalog = buildCatalogEntries([record])[0]!;
  const { system, prompt } = buildOptimizePrompt({ locale, skill: catalog, rubric });
  const raw = await callModel(caller, { model, system, prompt, schema: OptimizeEnvelopeSchema });
  const envelope = OptimizeEnvelopeSchema.safeParse(raw);

  const suggestions: OptimizationSuggestion[] = [];
  if (envelope.success) {
    for (const entry of envelope.data.suggestions ?? []) {
      const parsed = SuggestionSchema.safeParse(entry);
      if (!parsed.success) continue;
      const title = parsed.data.title.trim();
      if (!title) continue;
      suggestions.push({
        title,
        severity: normalizeSeverity(parsed.data.severity),
        rationale: (parsed.data.rationale ?? '').trim(),
        ...(parsed.data.before?.trim() ? { before: parsed.data.before.trim() } : {}),
        ...(parsed.data.after?.trim() ? { after: parsed.data.after.trim() } : {}),
      });
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }
  }

  return {
    skill: skillRef(record),
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    provider: settings.provider,
    model: settings.model,
    locale,
    signature: optimizationSignature(record, settings),
    summary: envelope.success ? (envelope.data.summary ?? '').trim() : '',
    suggestions,
  };
}
