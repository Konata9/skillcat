/**
 * LLM provider presets and a lightweight connectivity probe. SkillCat ships no
 * model: the user supplies their own key, endpoint and model. Everything except
 * Anthropic speaks the OpenAI-compatible chat-completions API.
 */
import type { LlmProvider, LlmSettings } from './types.js';
import type { FetchLike } from './cli/remote-search.js';

export interface LlmProviderPreset {
  id: LlmProvider;
  label: string;
  /** Wire format: Anthropic Messages, or OpenAI-compatible chat completions. */
  style: 'anthropic' | 'openai';
  baseUrl: string;
  model: string;
  requiresKey: boolean;
}

export const LLM_PROVIDERS: LlmProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Claude',
    style: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    requiresKey: true,
  },
  {
    id: 'openai',
    label: 'ChatGPT',
    style: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    requiresKey: true,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    style: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    requiresKey: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    style: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    requiresKey: true,
  },
  {
    id: 'qwen',
    label: 'Qwen',
    style: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    requiresKey: true,
  },
  {
    id: 'glm',
    label: 'GLM',
    style: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    requiresKey: true,
  },
  {
    id: 'kimi',
    label: 'Kimi',
    style: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    requiresKey: true,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    style: 'openai',
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'MiniMax-Text-01',
    requiresKey: true,
  },
  {
    id: 'mimo',
    label: 'Mimo',
    style: 'openai',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
    requiresKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    style: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    requiresKey: false,
  },
  {
    id: 'custom',
    label: 'Custom',
    style: 'openai',
    baseUrl: '',
    model: '',
    requiresKey: false,
  },
];

export function getLlmPreset(provider: LlmProvider): LlmProviderPreset {
  return LLM_PROVIDERS.find((preset) => preset.id === provider) ?? LLM_PROVIDERS[0]!;
}

export function defaultLlmSettings(): LlmSettings {
  const preset = getLlmPreset('openai');
  return { provider: preset.id, apiKey: '', baseUrl: preset.baseUrl, model: preset.model };
}

export interface LlmTestResult {
  ok: boolean;
  status: number | null;
  message: string;
}

function joinAnthropic(base: string): string {
  return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
}

/**
 * Sends a one-token request to verify the endpoint, key and model. Never
 * throws: transport and HTTP failures come back as `{ ok: false }`.
 */
export async function testLlmConnection(
  settings: LlmSettings,
  fetchImpl: FetchLike = fetch,
): Promise<LlmTestResult> {
  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  const model = settings.model.trim();
  const apiKey = settings.apiKey.trim();
  if (!base) return { ok: false, status: null, message: 'base URL is empty' };
  if (!model) return { ok: false, status: null, message: 'model is empty' };

  const { style } = getLlmPreset(settings.provider);
  const body = JSON.stringify({
    model,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'ping' }],
  });

  try {
    const response =
      style === 'anthropic'
        ? await fetchImpl(joinAnthropic(base), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'anthropic-version': '2023-06-01',
              'x-api-key': apiKey,
            },
            body,
            signal: AbortSignal.timeout(20_000),
          })
        : await fetchImpl(`${base}/chat/completions`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
            },
            body,
            signal: AbortSignal.timeout(20_000),
          });

    if (response.ok) return { ok: true, status: response.status, message: 'ok' };

    let detail = '';
    try {
      detail = response.text ? (await response.text()).trim().slice(0, 300) : '';
    } catch {
      detail = '';
    }
    return { ok: false, status: response.status, message: detail || `HTTP ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
