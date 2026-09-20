import { describe, expect, it } from 'vitest';
import {
  fetchLeaderboardApi,
  fetchRemoteSkillDetail,
  parseFindOutput,
} from '../cli/remote-search.js';
import type { FetchLike } from '../cli/remote-search.js';

describe('parseFindOutput', () => {
  it('parses cli find output pairs', () => {
    const stdout = [
      'Install with npx skills add <owner/repo@skill>',
      '',
      'vercel-labs/agent-skills@frontend-design 12K installs',
      '└ https://skills.sh/vercel-labs/agent-skills/frontend-design',
      '',
      'anthropics/skills@pdf 3.4K installs',
      '└ https://skills.sh/anthropics/skills/pdf',
    ].join('\n');

    const results = parseFindOutput(stdout);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      name: 'frontend-design',
      source: 'vercel-labs/agent-skills',
      installs: 12000,
      slug: 'vercel-labs/agent-skills/frontend-design',
    });
    expect(results[1]?.installs).toBe(3400);
  });

  it('ignores unrelated lines', () => {
    expect(parseFindOutput('No skills found for "zzz"')).toEqual([]);
  });
});

describe('fetchLeaderboardApi', () => {
  function fakeFetch(payload: unknown): { impl: FetchLike; calls: string[] } {
    const calls: string[] = [];
    const impl: FetchLike = async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => payload };
    };
    return { impl, calls };
  }

  it('maps leaderboard entries and keeps server order', async () => {
    const { impl, calls } = fakeFetch({
      skills: [
        {
          source: 'vercel-labs/skills',
          skillId: 'find-skills',
          name: 'find-skills',
          installs: 3465509,
          weeklyInstalls: [1, 2, 3],
          isOfficial: true,
        },
        {
          source: 'mattpocock/skills',
          skillId: 'grill-me',
          name: 'grill-me',
          installs: 1175111,
        },
      ],
    });

    const results = await fetchLeaderboardApi('all-time', 0, impl);
    expect(calls).toEqual(['https://skills.sh/api/skills/all-time/0']);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      name: 'find-skills',
      source: 'vercel-labs/skills',
      slug: 'vercel-labs/skills/find-skills',
      installs: 3465509,
      weeklyInstalls: [1, 2, 3],
      isOfficial: true,
    });
    expect(results[1]).toMatchObject({ name: 'grill-me', installs: 1175111 });
    expect(results[1]?.weeklyInstalls).toBeUndefined();
    expect(results[1]?.isOfficial).toBeUndefined();
  });

  it('surfaces change for the hot leaderboard and rejects bad responses', async () => {
    const { impl } = fakeFetch({
      skills: [{ source: 'op7418/humanizer-zh', skillId: 'humanizer-zh', installs: 6, change: 2 }],
    });
    const results = await fetchLeaderboardApi('hot', 0, impl);
    expect(results[0]?.change).toBe(2);

    const failing: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(fetchLeaderboardApi('hot', 0, failing)).rejects.toThrow('500');
  });
});

describe('fetchRemoteSkillDetail', () => {
  function fakeFetch(payload: unknown, status = 200): { impl: FetchLike; calls: string[] } {
    const calls: string[] = [];
    const impl: FetchLike = async (url) => {
      calls.push(url);
      return { ok: status < 400, status, json: async () => payload };
    };
    return { impl, calls };
  }

  const skillMd = [
    '---',
    'name: pdf',
    'description: Use this skill for PDF work.',
    'license: MIT',
    '---',
    '',
    '# PDF Processing Guide',
  ].join('\n');

  it('parses SKILL.md and builds the install command from the download API', async () => {
    const { impl, calls } = fakeFetch({
      files: [
        { path: 'reference.md', contents: 'ref' },
        { path: 'SKILL.md', contents: skillMd },
      ],
      hash: 'abc123',
    });

    const detail = await fetchRemoteSkillDetail('anthropics/skills/pdf', impl);
    expect(calls).toEqual(['https://skills.sh/api/download/anthropics/skills/pdf']);
    expect(detail).toMatchObject({
      name: 'pdf',
      source: 'anthropics/skills',
      slug: 'anthropics/skills/pdf',
      description: 'Use this skill for PDF work.',
      license: 'MIT',
      body: '\n# PDF Processing Guide',
      installCommand: 'npx skills add https://github.com/anthropics/skills --skill pdf',
      hash: 'abc123',
    });
    expect(detail.files.map((file) => file.path)).toEqual(['reference.md', 'SKILL.md']);
  });

  it('fails when the payload has no SKILL.md or the API errors', async () => {
    const { impl } = fakeFetch({ files: [{ path: 'README.md', contents: 'x' }] });
    await expect(fetchRemoteSkillDetail('owner/repo/skill', impl)).rejects.toThrow('SKILL.md');

    const failing: FetchLike = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await expect(fetchRemoteSkillDetail('owner/repo/skill', failing)).rejects.toThrow('404');
  });
});
