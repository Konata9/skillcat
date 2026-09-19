import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore, defaultConfig } from '../config.js';
import { pathExists } from '../fs-utils.js';
import { getConfigDir, getLegacyConfigDir } from '../paths.js';

function withEnv(
  vars: Record<string, string | undefined>,
  run: () => void | Promise<void>,
): Promise<void> {
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  return Promise.resolve()
    .then(() => {
      for (const [key, value] of Object.entries(vars)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      return run();
    })
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

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

  it('honors the legacy SKILLMAN_CONFIG_DIR env var', async () => {
    await withEnv(
      { SKILLCAT_CONFIG_DIR: undefined, SKILLMAN_CONFIG_DIR: '/tmp/legacy-skillcat-config' },
      () => {
        expect(getConfigDir()).toBe('/tmp/legacy-skillcat-config');
      },
    );
  });

  it('copies the legacy config dir once on first load', async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), 'skillcat-home-'));
    const newDir = await mkdtemp(join(tmpdir(), 'skillcat-config-'));

    await withEnv({ HOME: fakeHome, SKILLCAT_CONFIG_DIR: newDir }, async () => {
      const legacyDir = getLegacyConfigDir();
      await mkdir(legacyDir, { recursive: true });
      await writeFile(
        join(legacyDir, 'config.json'),
        JSON.stringify({ version: 1, customSkillDirs: ['.legacy/skills'] }),
      );
      await writeFile(join(legacyDir, 'annotations.json'), '{}');

      const store = new ConfigStore();
      const config = await store.load();

      expect(config.customSkillDirs).toEqual(['.legacy/skills']);
      expect(await pathExists(join(newDir, 'annotations.json'))).toBe(true);
    });
  });
});
