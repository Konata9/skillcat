import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanScope } from '../discovery.js';

const SKILL_MD = [
  '---',
  'name: foo',
  'description: Use when testing discovery.',
  '---',
  '# Foo',
  'Body',
].join('\n');

describe('scanScope (project)', () => {
  it('discovers canonical skills, verifies links and reports orphan locks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillman-scan-'));
    await mkdir(join(root, '.agents', 'skills', 'foo'), { recursive: true });
    await writeFile(join(root, '.agents', 'skills', 'foo', 'SKILL.md'), SKILL_MD);

    await mkdir(join(root, '.claude', 'skills'), { recursive: true });
    await symlink('../../.agents/skills/foo', join(root, '.claude', 'skills', 'foo'));
    await symlink('../../.agents/skills/ghost', join(root, '.claude', 'skills', 'ghost'));

    await writeFile(
      join(root, 'skills-lock.json'),
      JSON.stringify({
        version: 3,
        skills: {
          foo: { source: 'owner/repo', sourceType: 'github', skillFolderHash: 'f'.repeat(40) },
          ghost: { source: 'owner/repo', sourceType: 'github', skillFolderHash: 'g'.repeat(40) },
        },
      }),
    );

    const result = await scanScope({
      scope: 'project',
      root,
      annotations: {},
      showInternal: false,
      copyHashCache: new Map(),
    });

    expect(result.records).toHaveLength(1);
    const foo = result.records[0]!;
    expect(foo.name).toBe('foo');
    expect(foo.lock?.source).toBe('owner/repo');
    const claudeLink = foo.links.find((link) => link.agentId === 'claude-code');
    expect(claudeLink?.state).toBe('symlink-ok');

    expect(result.orphans.map((orphan) => orphan.name)).toEqual(['ghost']);
  });

  it('skips internal skills unless requested', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillman-scan-internal-'));
    await mkdir(join(root, '.agents', 'skills', 'secret'), { recursive: true });
    await writeFile(
      join(root, '.agents', 'skills', 'secret', 'SKILL.md'),
      ['---', 'name: secret', 'description: hidden', 'metadata:', '  internal: true', '---', 'x'].join('\n'),
    );

    const hidden = await scanScope({
      scope: 'project',
      root,
      annotations: {},
      showInternal: false,
      copyHashCache: new Map(),
    });
    expect(hidden.records).toHaveLength(0);

    const shown = await scanScope({
      scope: 'project',
      root,
      annotations: {},
      showInternal: true,
      copyHashCache: new Map(),
    });
    expect(shown.records).toHaveLength(1);
  });
});
