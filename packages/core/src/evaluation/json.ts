/**
 * Tolerant JSON handling for model responses: slice the JSON value out of a
 * prose / fenced reply, repair the loose output OpenAI-compatible models emit,
 * and retry once with a stricter instruction when parsing fails.
 */
import { parsePartialJson, type LanguageModel } from 'ai';
import { jsonrepair } from 'jsonrepair';
import type { z } from 'zod';

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

/**
 * Calls the model and retries once with a stricter JSON-only instruction when
 * the reply cannot be parsed. Keeps flaky providers from failing a whole run.
 */
export async function callModel(
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
