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
    const root = await mkdtemp(join(tmpdir(), 'skillcat-scan-'));
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
    const root = await mkdtemp(join(tmpdir(), 'skillcat-scan-internal-'));
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

  it('discovers skills in agent-native dirs such as .opencode/skills', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillcat-scan-native-'));
    await mkdir(join(root, '.opencode', 'skills', 'native'), { recursive: true });
    await writeFile(
      join(root, '.opencode', 'skills', 'native', 'SKILL.md'),
      ['---', 'name: native', 'description: Use when testing native agent dirs.', '---', '# Native'].join('\n'),
    );

    const result = await scanScope({
      scope: 'project',
      root,
      annotations: {},
      showInternal: false,
      copyHashCache: new Map(),
    });

    expect(result.records.map((record) => record.name)).toEqual(['native']);
    const opencode = result.records[0]!.links.find((link) => link.agentId === 'opencode');
    expect(opencode?.state).toBe('canonical');
    expect(opencode?.path).toBe(join(root, '.opencode', 'skills', 'native'));
  });

  it('does not mark a candidate dir missing when another one holds the skill', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillcat-scan-multidir-'));
    await mkdir(join(root, '.agents', 'skills', 'foo'), { recursive: true });
    await writeFile(join(root, '.agents', 'skills', 'foo', 'SKILL.md'), SKILL_MD);
    await mkdir(join(root, '.opencode', 'skills', 'other'), { recursive: true });
    await writeFile(
      join(root, '.opencode', 'skills', 'other', 'SKILL.md'),
      ['---', 'name: other', 'description: Use when testing sibling skills.', '---', '# Other'].join('\n'),
    );

    const result = await scanScope({
      scope: 'project',
      root,
      annotations: {},
      showInternal: false,
      copyHashCache: new Map(),
    });

    const foo = result.records.find((record) => record.name === 'foo');
    const opencode = foo?.links.filter((link) => link.agentId === 'opencode') ?? [];
    expect(opencode).toHaveLength(1);
    expect(opencode[0]?.state).toBe('canonical');
    expect(opencode[0]?.path).toBe(join(root, '.agents', 'skills', 'foo'));
  });

  it('scans user-configured project skill dirs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillcat-scan-custom-'));
    await mkdir(join(root, '.my-skills', 'custom'), { recursive: true });
    await writeFile(
      join(root, '.my-skills', 'custom', 'SKILL.md'),
      ['---', 'name: custom', 'description: Use when testing custom dirs.', '---', '# Custom'].join('\n'),
    );

    const result = await scanScope({
      scope: 'project',
      root,
      annotations: {},
      showInternal: false,
      copyHashCache: new Map(),
      customSkillDirs: ['.my-skills'],
    });

    expect(result.records.map((record) => record.name)).toEqual(['custom']);
  });

  it('ignores global custom dirs in the project scope', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillcat-scan-custom-global-'));
    await mkdir(join(root, '.my-skills', 'custom'), { recursive: true });
    await writeFile(
      join(root, '.my-skills', 'custom', 'SKILL.md'),
      ['---', 'name: custom', 'description: Use when testing custom dirs.', '---', '# Custom'].join('\n'),
    );

    const result = await scanScope({
      scope: 'project',
      root,
      annotations: {},
      showInternal: false,
      copyHashCache: new Map(),
      customSkillDirs: ['~/.my-skills'],
    });

    expect(result.records).toHaveLength(0);
  });
});
