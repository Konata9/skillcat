import { describe, expect, it } from 'vitest';
import type { FetchLike, FetchLikeInit } from '../cli/remote-search.js';
import { sanitizeLlm } from '../config.js';
import { getLlmPreset, LLM_PROVIDERS, testLlmConnection } from '../llm.js';

interface Call {
  url: string;
  init?: FetchLikeInit;
}

function fakeFetch(status: number, body: string): { impl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(body) as unknown,
      text: async () => body,
    };
  };
  return { impl, calls };
}

describe('LLM providers', () => {
  it('exposes the expected presets', () => {
    expect(LLM_PROVIDERS.map((preset) => preset.id)).toEqual([
      'anthropic',
      'openai',
      'gemini',
      'deepseek',
      'qwen',
      'glm',
      'kimi',
      'minimax',
      'mimo',
      'ollama',
      'custom',
    ]);
    expect(getLlmPreset('ollama').requiresKey).toBe(false);
    expect(getLlmPreset('anthropic').style).toBe('anthropic');
  });
});

describe('testLlmConnection', () => {
  it('posts to the OpenAI-compatible chat endpoint with a bearer token', async () => {
    const { impl, calls } = fakeFetch(200, '{"choices":[]}');
    const result = await testLlmConnection(
      {
        provider: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1/',
        model: 'gpt-4o',
      },
      impl,
    );
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers?.authorization).toBe('Bearer sk-test');
  });

  it('posts to the Anthropic messages endpoint with x-api-key', async () => {
    const { impl, calls } = fakeFetch(200, '{"content":[]}');
    const result = await testLlmConnection(
      {
        provider: 'anthropic',
        apiKey: 'k',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
      },
      impl,
    );
    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.init?.headers?.['x-api-key']).toBe('k');
    expect(calls[0]?.init?.headers?.['anthropic-version']).toBe('2023-06-01');
  });

  it('reports HTTP failures with the response body', async () => {
    const { impl } = fakeFetch(401, 'invalid api key');
    const result = await testLlmConnection(
      {
        provider: 'deepseek',
        apiKey: 'x',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      },
      impl,
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.message).toBe('invalid api key');
  });

  it('rejects an empty endpoint or model without sending a request', async () => {
    const { impl, calls } = fakeFetch(200, '{}');
    expect(
      (await testLlmConnection({ provider: 'custom', apiKey: '', baseUrl: '', model: 'x' }, impl))
        .ok,
    ).toBe(false);
    expect(
      (
        await testLlmConnection(
          { provider: 'custom', apiKey: '', baseUrl: 'https://x.example/v1', model: '' },
          impl,
        )
      ).ok,
    ).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('sanitizeLlm', () => {
  it('falls back to provider presets for missing fields', () => {
    const llm = sanitizeLlm({ provider: 'deepseek' });
    expect(llm.provider).toBe('deepseek');
    expect(llm.baseUrl).toBe(getLlmPreset('deepseek').baseUrl);
    expect(llm.model).toBe(getLlmPreset('deepseek').model);
  });

  it('ignores unknown providers and non-string values', () => {
    const llm = sanitizeLlm({ provider: 'nope', apiKey: 42, baseUrl: '', model: '' });
    expect(llm.provider).toBe('openai');
    expect(llm.apiKey).toBe('');
    expect(llm.baseUrl).toBe(getLlmPreset('openai').baseUrl);
  });
});
