import { describe, expect, it } from 'vitest';
import { parseFindOutput } from '../cli/remote-search.js';

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
