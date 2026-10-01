import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore, defaultConfig } from '../config.js';

describe('config', () => {
  it('defaults to no custom skill dirs', () => {
    expect(defaultConfig().customSkillDirs).toEqual([]);
  });

  it('sanitizes custom skill dirs from a hand-edited file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillcat-config-'));
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({
        version: 1,
        customSkillDirs: ['.claude/skills', '  .claude/skills  ', '', 42, '~/.my-skills'],
      }),
    );

    const store = new ConfigStore(dir);
    const config = await store.load();

    expect(config.customSkillDirs).toEqual(['.claude/skills', '~/.my-skills']);
  });

  it('falls back to an empty list when the field is malformed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillcat-config-'));
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ customSkillDirs: '.claude/skills' }),
    );

    const store = new ConfigStore(dir);

    expect((await store.load()).customSkillDirs).toEqual([]);
  });

  it('writes the config file on demand for open / reveal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillcat-config-'));
    const store = new ConfigStore(dir);

    await store.ensureFile();

    const raw = JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.customSkillDirs).toEqual([]);
  });
});
