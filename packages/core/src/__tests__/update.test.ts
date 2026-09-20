import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../cli/remote-search.js';
import { checkForUpdate, compareVersions } from '../update.js';

function fakeFetch(status: number, payload: unknown): { impl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const impl: FetchLike = async (url) => {
    calls.push(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  return { impl, calls };
}

describe('compareVersions', () => {
  it('compares numerically, ignoring a leading v', () => {
    expect(compareVersions('1.10.0', '1.2.0')).toBe(1);
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
  });
});

describe('checkForUpdate', () => {
  it('is unconfigured without a repo and does not fetch', async () => {
    const { impl, calls } = fakeFetch(200, {});
    const result = await checkForUpdate('', '1.0.0', impl);
    expect(result.configured).toBe(false);
    expect(result.repo).toBe('');
    expect(result.hasUpdate).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('detects a newer release', async () => {
    const { impl, calls } = fakeFetch(200, {
      tag_name: 'v1.1.0',
      html_url: 'https://github.com/o/r/releases/tag/v1.1.0',
      published_at: '2026-01-01T00:00:00Z',
    });
    const result = await checkForUpdate('o/r', '1.0.0', impl);
    expect(calls[0]).toBe('https://api.github.com/repos/o/r/releases/latest');
    expect(result.repo).toBe('o/r');
    expect(result.hasUpdate).toBe(true);
    expect(result.latest).toBe('1.1.0');
    expect(result.url).toBe('https://github.com/o/r/releases/tag/v1.1.0');
  });

  it('treats a repository without releases as having none', async () => {
    const { impl } = fakeFetch(404, {});
    const result = await checkForUpdate('o/r', '1.0.0', impl);
    expect(result.hasUpdate).toBe(false);
    expect(result.latest).toBeNull();
    expect(result.error).toBeUndefined();
    expect(result.url).toBe('https://github.com/o/r/releases');
  });

  it('reports an error for other non-ok responses', async () => {
    const { impl } = fakeFetch(500, {});
    const result = await checkForUpdate('o/r', '1.0.0', impl);
    expect(result.hasUpdate).toBe(false);
    expect(result.error).toBe('HTTP 500');
  });
});
