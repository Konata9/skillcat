import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SkillManager } from '@skillcat/core';
import { bootstrap } from './bootstrap';

const originalHome = process.env.HOME;
const originalConfig = process.env.SKILLCAT_CONFIG_DIR;

function skillMd(name: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: Use when ${name} work happens.`,
    `when_to_use: ${name} trigger`,
    '---',
    `# ${name}`,
  ].join('\n');
}

beforeAll(async () => {
  const fakeHome = await mkdtemp(join(tmpdir(), 'skillcat-boot-home-'));
  const configDir = await mkdtemp(join(tmpdir(), 'skillcat-boot-config-'));
  process.env.HOME = fakeHome;
  process.env.SKILLCAT_CONFIG_DIR = configDir;

  for (const name of ['alpha', 'beta']) {
    await mkdir(join(fakeHome, '.agents', 'skills', name), { recursive: true });
    await writeFile(join(fakeHome, '.agents', 'skills', name, 'SKILL.md'), skillMd(name));
  }
  await writeFile(
    join(configDir, 'config.json'),
    JSON.stringify({
      version: 1,
      roots: [],
      projects: [],
      recent: [],
      skillsCommand: ['true'],
      thresholds: { overlap: 0.3, duplicate: 0.5 },
      showInternal: false,
      maxScanDepth: 3,
    }),
  );
});

afterAll(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalConfig === undefined) delete process.env.SKILLCAT_CONFIG_DIR;
  else process.env.SKILLCAT_CONFIG_DIR = originalConfig;
});

describe('bootstrap', () => {
  it('scans on startup so the first snapshot already has skills', async () => {
    const manager = new SkillManager({ configDir: process.env.SKILLCAT_CONFIG_DIR });
    await bootstrap(manager);

    expect(manager.state.scannedAt).not.toBeNull();
    expect(manager.state.global.map((record) => record.name).sort()).toEqual(['alpha', 'beta']);
  });
});
