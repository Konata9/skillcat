import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeSkillFolderHash } from '../fs-utils.js';
import { parseFrontmatter, parseSkillDir } from '../skill.js';

describe('parseFrontmatter', () => {
  it('parses block scalars', () => {
    const result = parseFrontmatter(
      ['---', 'name: demo', 'description: |', '  line one', '  line two', '---', '# Body'].join('\n'),
    );
    expect(result.data.name).toBe('demo');
    expect(result.data.description).toBe('line one\nline two\n');
    expect(result.content.trim()).toBe('# Body');
  });

  it('handles missing frontmatter', () => {
    const result = parseFrontmatter('# Just markdown');
    expect(result.data).toEqual({});
    expect(result.content).toBe('# Just markdown');
  });

  it('reports malformed yaml without throwing', () => {
    const result = parseFrontmatter(['---', 'name: [unclosed', '---', 'body'].join('\n'));
    expect(result.error).toBeTruthy();
    expect(result.data).toEqual({});
  });
});

describe('parseSkillDir', () => {
  it('reads metadata, files and triggers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillcat-skill-'));
    await mkdir(join(dir, 'scripts'), { recursive: true });
    await writeFile(
      join(dir, 'SKILL.md'),
      [
        '---',
        'name: demo',
        'description: Use when writing reports. Not for debugging.',
        'when_to_use: 周报, 月报',
        '---',
        '# Demo',
        'Body text',
      ].join('\n'),
    );
    await writeFile(join(dir, 'scripts', 'run.sh'), 'echo hi');

    const parsed = await parseSkillDir(dir);
    expect(parsed.name).toBe('demo');
    expect(parsed.triggers.positive.map((term) => term.text)).toContain('周报');
    expect(parsed.files.map((file) => file.kind)).toContain('script');
    expect(parsed.sizeBytes).toBeGreaterThan(0);
  });
});

describe('computeSkillFolderHash', () => {
  it('is deterministic and ignores .git/node_modules', async () => {
    const dirA = await mkdtemp(join(tmpdir(), 'skillcat-hash-a-'));
    const dirB = await mkdtemp(join(tmpdir(), 'skillcat-hash-b-'));
    for (const dir of [dirA, dirB]) {
      await writeFile(join(dir, 'SKILL.md'), 'same');
      await mkdir(join(dir, 'node_modules', 'x'), { recursive: true });
      await writeFile(join(dir, 'node_modules', 'x', 'index.js'), 'ignored');
      await mkdir(join(dir, '.git'), { recursive: true });
      await writeFile(join(dir, '.git', 'HEAD'), 'ignored');
    }
    const hashA = await computeSkillFolderHash(dirA);
    const hashB = await computeSkillFolderHash(dirB);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when content changes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillcat-hash-c-'));
    await writeFile(join(dir, 'SKILL.md'), 'one');
    const first = await computeSkillFolderHash(dir);
    await writeFile(join(dir, 'SKILL.md'), 'two');
    const second = await computeSkillFolderHash(dir);
    expect(first).not.toBe(second);
  });
});
