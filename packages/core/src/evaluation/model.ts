/**
 * Builds an AI SDK language model from the user's LLM settings.
 *
 * Deliberately separate from `llm.ts`: the renderer imports value helpers from
 * the `@skillcat/core/llm` subpath, so the provider SDKs must not leak there.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { FetchLike } from '../cli/remote-search.js';
import { getLlmPreset } from '../llm.js';
import type { LlmSettings } from '../types.js';

export function createEvaluationModel(
  settings: LlmSettings,
  fetchImpl?: FetchLike,
): LanguageModel {
  const baseURL = settings.baseUrl.trim().replace(/\/+$/, '');
  const apiKey = settings.apiKey.trim();
  const modelId = settings.model.trim();
  // Electron's `net.fetch` is a real fetch at runtime; the structural FetchLike
  // type is what the manager injects for proxy support.
  const fetchFn = fetchImpl as unknown as typeof fetch | undefined;
  const preset = getLlmPreset(settings.provider);

  if (preset.style === 'anthropic') {
    const provider = createAnthropic({ apiKey, baseURL, fetch: fetchFn });
    return provider(modelId);
  }

  const provider = createOpenAICompatible({
    name: settings.provider,
    baseURL,
    apiKey: apiKey || undefined,
    fetch: fetchFn,
    // Most OpenAI-compatible endpoints (and local servers) do not implement the
    // strict json_schema response format; the prompt carries the schema instead.
    supportsStructuredOutputs: false,
  });
  return provider(modelId);
}
