/**
 * LLM skill evaluation: scores every scanned skill, then judges pre-filtered
 * candidate pairs for duplication/conflicts, and finally writes an overview.
 *
 * The deterministic candidate filter reuses the same similarity helpers as the
 * rule engine, so the AI reviews the same leads the local rules surface.
 */
import { createHash } from 'node:crypto';
import { parsePartialJson, streamText, type LanguageModel } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import type { FetchLike } from '../cli/remote-search.js';
import { recordKey } from '../keys.js';
import { bodyShingles, computeOverlaps, jaccard } from '../similarity.js';
import type {
  AiPairVerdict,
  AiVerdict,
  EvaluationEvent,
  EvaluationGrade,
  EvaluationIssueKind,
  EvaluationProgress,
  EvaluationReport,
  EvaluationSeverity,
  EvaluationSkillScore,
  LlmSettings,
  SkillRecord,
  SkillRef,
} from '../types.js';
import { createEvaluationModel } from './model.js';
import {
  buildScoringPrompt,
  buildSummaryPrompt,
  buildVerdictPrompt,
  type CatalogPair,
  type CatalogSkill,
} from './prompt.js';
import { pairKey } from './verdicts.js';

const EXCERPT_CHARS = 1200;
const MAX_BATCH_CHARS = 12_000;
const MAX_BATCH_SKILLS = 6;
const MAX_PAIRS = 24;
const PAIR_TRIGGER_THRESHOLD = 0.2;
const PAIR_BODY_THRESHOLD = 0.15;
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

export type EvaluationLocale = 'zh' | 'en';

export interface ModelCallRequest {
  model: LanguageModel;
  system: string;
  prompt: string;
  schema: z.ZodType;
  signal?: AbortSignal;
  /** Receives streamed reasoning deltas when the provider exposes them. */
  onReasoning?: (delta: string) => void;
}

/** Injectable model call so tests never touch the network. */
export type ModelCaller = (request: ModelCallRequest) => Promise<unknown>;

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

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}

function firstJsonIndex(text: string): number {
  const object = text.indexOf('{');
  const array = text.indexOf('[');
  if (object < 0) return array;
  if (array < 0) return object;
  return Math.min(object, array);
}

/**
 * Slices the JSON value out of a model response, string-aware. When the output
 * is truncated the whole tail is returned so a partial parser can repair it —
 * never a naive `lastIndexOf`, which yields malformed fragments.
 */
export function extractJsonCandidate(text: string): string {
  const cleaned = stripFences(text);
  const start = firstJsonIndex(cleaned);
  if (start < 0) throw new Error('model response contained no JSON');
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index]!;
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return cleaned.slice(start, index + 1);
    }
  }
  return cleaned.slice(start);
}

/** Strict JSON extraction from a model response. */
export function extractJson(text: string): unknown {
  return JSON.parse(extractJsonCandidate(text));
}

/**
 * Parses a model response, repairing the loose JSON that OpenAI-compatible
 * models commonly emit: truncated arrays, unquoted keys, single/smart quotes,
 * trailing commas and comments.
 */
export async function parseModelJson(text: string): Promise<unknown> {
  const candidate = extractJsonCandidate(text);
  try {
    return JSON.parse(candidate);
  } catch {
    // `jsonrepair` covers the syntax slips; the AI SDK partial parser covers
    // streaming-style truncation.
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      // fall through
    }
    try {
      const { value, state } = await parsePartialJson(candidate);
      if (value !== undefined && (state === 'successful-parse' || state === 'repaired-parse')) {
        return value;
      }
    } catch {
      // fall through
    }
    throw new Error(`model response was not valid JSON: ${candidate.slice(0, 200)}`);
  }
}

function excerpt(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS)}…` : text;
}

function coerceList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export function buildCatalogEntries(records: SkillRecord[]): CatalogSkill[] {
  return records.map((record, index) => ({
    id: `s${index + 1}`,
    name: record.name,
    scope: record.scope,
    ...(record.projectPath ? { projectPath: record.projectPath } : {}),
    description: record.description,
    whenToUse: coerceList(record.frontmatter.when_to_use).slice(0, 8),
    triggers: record.triggers.positive.slice(0, 12).map((term) => term.text),
    excerpt: excerpt(record.body),
    fileCount: record.files.length,
  }));
}

/** Candidate pairs from trigger overlap + body similarity, capped. */
export function buildPairs(records: SkillRecord[], catalog: CatalogSkill[]): CatalogPair[] {
  const idByKey = new Map(records.map((record, index) => [recordKey(record), catalog[index]!.id]));
  const pairs = new Map<string, CatalogPair>();
  const add = (aKey: string, bKey: string, reason: string) => {
    const a = idByKey.get(aKey);
    const b = idByKey.get(bKey);
    if (!a || !b || a === b) return;
    const key = [a, b].sort().join('|');
    if (pairs.has(key)) return;
    pairs.set(key, { id: `p${pairs.size + 1}`, a, b, reason });
  };

  for (const pair of computeOverlaps(records, PAIR_TRIGGER_THRESHOLD)) {
    add(pair.aKey, pair.bKey, `trigger overlap ${Math.round(pair.score * 100)}%`);
  }

  const shingles = new Map<string, Set<string>>();
  for (let i = 0; i < records.length; i += 1) {
    const a = records[i]!;
    if (a.body.length < 200) continue;
    const aKey = recordKey(a);
    for (let j = i + 1; j < records.length; j += 1) {
      const b = records[j]!;
      if (b.body.length < 200 || a.name === b.name) continue;
      const bKey = recordKey(b);
      const aShingles = shingles.get(aKey) ?? bodyShingles(a.body);
      const bShingles = shingles.get(bKey) ?? bodyShingles(b.body);
      shingles.set(aKey, aShingles);
      shingles.set(bKey, bShingles);
      const score = jaccard(aShingles, bShingles);
      if (score >= PAIR_BODY_THRESHOLD) {
        add(aKey, bKey, `body similarity ${Math.round(score * 100)}%`);
      }
    }
  }

  return [...pairs.values()].slice(0, MAX_PAIRS);
}

/**
 * Calls the model and retries once with a stricter JSON-only instruction when
 * the reply cannot be parsed. Keeps flaky providers from failing a whole run.
 */
async function callModel(
  caller: ModelCaller,
  request: ModelCallRequest,
  attempts = 2,
): Promise<unknown> {
  let lastError: unknown;
  let current = request;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await caller(current);
    } catch (error) {
      lastError = error;
      current = {
        ...request,
        prompt: `${request.prompt}\n\nIMPORTANT: your previous reply was not valid JSON. Reply with the JSON object only — no prose and no code fences.`,
      };
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function chunkSkills(skills: CatalogSkill[]): CatalogSkill[][] {
  const batches: CatalogSkill[][] = [];
  let current: CatalogSkill[] = [];
  let chars = 0;
  for (const skill of skills) {
    const size = JSON.stringify(skill).length;
    if (current.length > 0 && (current.length >= MAX_BATCH_SKILLS || chars + size > MAX_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(skill);
    chars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeGrade(grade: unknown, score: number): EvaluationGrade {
  const value = typeof grade === 'string' ? grade.trim().toUpperCase() : '';
  if (value === 'A' || value === 'B' || value === 'C' || value === 'D') return value;
  const safe = clampScore(score);
  if (safe >= 90) return 'A';
  if (safe >= 75) return 'B';
  if (safe >= 60) return 'C';
  return 'D';
}

function normalizeKind(kind: string): EvaluationIssueKind {
  const value = kind.trim().toLowerCase();
  if (
    value === 'duplicate' ||
    value === 'conflict' ||
    value === 'quality' ||
    value === 'trigger' ||
    value === 'boundary'
  ) {
    return value;
  }
  return 'quality';
}

function normalizeSeverity(severity: unknown): EvaluationSeverity {
  const value = typeof severity === 'string' ? severity.trim().toLowerCase() : '';
  if (value === 'error' || value === 'warn' || value === 'info') return value;
  return 'warn';
}

function normalizeVerdict(verdict: unknown): AiVerdict {
  const value = typeof verdict === 'string' ? verdict.trim().toLowerCase() : '';
  if (value === 'confirmed' || value === 'false-positive' || value === 'uncertain') return value;
  return 'uncertain';
}

function cleanList(list: string[] | undefined): string[] {
  return (list ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

/**
 * Models occasionally echo the catalog ids (`s1`, `s45`) in prose. Rewrite any
 * such reference to the skill's name so the report reads naturally.
 */
function replaceSkillIds(text: string, names: Map<string, string>): string {
  if (!text) return text;
  // `(?![\w-])` avoids mangling real names like "s3-upload".
  return text.replace(/\bs\s?(\d+)(?![\w-])/gi, (match, digits: string) => names.get(`s${digits}`) ?? match);
}

function skillNames(catalog: CatalogSkill[], records: SkillRecord[]): Map<string, string> {
  return new Map(catalog.map((skill, index) => [skill.id, records[index]?.name ?? skill.name]));
}

function toRef(record: SkillRecord): SkillRef {
  return {
    name: record.name,
    scope: record.scope,
    projectPath: record.projectPath,
    path: record.path,
  };
}

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
      const skills: [SkillRef, SkillRef] = [toRef(a), toRef(b)];
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
          skill: toRef(record),
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
