import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverProjects } from '../projects.js';

const SKILL_MD = [
  '---',
  'name: foo',
  'description: Use when testing project discovery.',
  '---',
  '# Foo',
].join('\n');

describe('discoverProjects', () => {
  it('finds projects via agent-native skill dirs from the registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillcat-projects-'));
    await mkdir(join(root, 'cursor-app', '.cursor', 'skills', 'foo'), { recursive: true });
    await writeFile(join(root, 'cursor-app', '.cursor', 'skills', 'foo', 'SKILL.md'), SKILL_MD);
    await mkdir(join(root, 'trae-app', '.trae', 'skills'), { recursive: true });

    const projects = await discoverProjects([root]);

    expect(projects.find((project) => project.name === 'cursor-app')?.markers).toContain(
      '.cursor/skills',
    );
    expect(projects.find((project) => project.name === 'trae-app')?.markers).toContain(
      '.trae/skills',
    );
  });

  it('ignores plain skills dirs without a SKILL.md inside', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillcat-projects-plain-'));
    await mkdir(join(root, 'empty-app', 'skills'), { recursive: true });

    const projects = await discoverProjects([root]);

    expect(projects.find((project) => project.name === 'empty-app')).toBeUndefined();
  });

  it('discovers projects via configured custom skill dirs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillcat-projects-custom-'));
    await mkdir(join(root, 'custom-app', '.my-skills'), { recursive: true });

    const projects = await discoverProjects([root], { customSkillDirs: ['.my-skills'] });

    expect(projects.find((project) => project.name === 'custom-app')?.markers).toContain(
      '.my-skills',
    );
  });
});
