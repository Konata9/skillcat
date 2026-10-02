import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { opencodeBridge } from '../bridge/adapters/opencode/index.js';
import { buildOpencodePluginSource, OPENCODE_MARKER } from '../bridge/adapters/opencode/plugin-template.js';
import { localizeEvent, buildCatalogIndex } from '../bridge/events.js';
import { BridgeService } from '../bridge/service.js';
import { computeActivityStats } from '../bridge/stats.js';
import { integrationsFilePath, runtimeEventsFilePath, runtimeSpoolFilePath } from '../paths.js';
import type { ActivitySettings, RuntimeSkillEvent, SkillRecord } from '../types.js';

const ACTIVITY: ActivitySettings = {
  enabled: true,
  storePhrase: true,
  retentionDays: 90,
  maxPhraseChars: 300,
};

function record(partial: Partial<SkillRecord> & { name: string }): SkillRecord {
  return {
    scope: 'global',
    path: `/tmp/skills/${partial.name}`,
    description: '',
    frontmatter: {},
    body: '',
    bodyTruncated: false,
    source: null,
    sourceUrl: null,
    sourceType: null,
    agentsDeclared: [],
    lock: null,
    links: [],
    contentHash: 'a'.repeat(64),
    files: [],
    sizeBytes: 0,
    triggers: { positive: [], negative: [], intents: [], hasWhenSignal: true },
    internal: false,
    installedAt: null,
    updatedAt: null,
    mtimeMs: 0,
    ...partial,
  };
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('opencode bridge adapter', () => {
  it('parses a valid spool record', () => {
    const parsed = opencodeBridge.parse({
      v: 1,
      adapterId: 'opencode',
      name: 'pdf',
      phrase: 'make a pdf',
      task: 'Report',
      sessionId: 's1',
      cwd: '/tmp/proj',
      ts: 1_700_000_000_000,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.skillName).toBe('pdf');
    expect(parsed?.phrase).toBe('make a pdf');
    expect(parsed?.task).toBe('Report');
    expect(parsed?.at).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('rejects records from other adapters or without a name', () => {
    expect(opencodeBridge.parse({ adapterId: 'other', name: 'x' })).toBeNull();
    expect(opencodeBridge.parse({ adapterId: 'opencode' })).toBeNull();
    expect(opencodeBridge.parse(null)).toBeNull();
  });

  it('generates a plugin carrying the marker and spool path', () => {
    const source = buildOpencodePluginSource('/tmp/config/runtime-spool.jsonl');
    expect(source).toContain(OPENCODE_MARKER);
    expect(source).toContain('/tmp/config/runtime-spool.jsonl');
    expect(source).toContain('tool.execute.after');
  });
});

describe('event localization', () => {
  const index = buildCatalogIndex([
    record({ name: 'deploy', scope: 'global' }),
    record({ name: 'deploy', scope: 'project', projectPath: '/proj', path: '/proj/.agents/skills/deploy' }),
    record({
      name: 'pdf',
      triggers: {
        positive: [{ text: '生成 PDF', norm: '生成 pdf', kind: 'positive', source: 'description', weight: 1 }],
        negative: [],
        intents: [],
        hasWhenSignal: true,
      },
    }),
  ]);

  const parse = (raw: unknown) => opencodeBridge.parse(raw)!;

  it('prefers the project skill matching the event cwd', () => {
    const event = localizeEvent(
      parse({ adapterId: 'opencode', name: 'deploy', cwd: '/proj/sub' }),
      opencodeBridge,
      index,
      ACTIVITY,
    );
    expect(event?.scope).toBe('project');
    expect(event?.projectPath).toBe('/proj');
  });

  it('falls back to the global skill outside any project', () => {
    const event = localizeEvent(
      parse({ adapterId: 'opencode', name: 'deploy', cwd: '/elsewhere' }),
      opencodeBridge,
      index,
      ACTIVITY,
    );
    expect(event?.scope).toBe('global');
  });

  it('records the longest matching trigger term and truncates the phrase', () => {
    const event = localizeEvent(
      parse({ adapterId: 'opencode', name: 'pdf', phrase: '帮我生成 PDF 文件' }),
      opencodeBridge,
      index,
      { storePhrase: true, maxPhraseChars: 5 },
    );
    expect(event?.triggerTerm).toBe('生成 PDF');
    expect(event?.phrase?.endsWith('…')).toBe(true);
    expect(event!.phrase!.length).toBe(6);
  });

  it('drops skills unknown to the catalog', () => {
    const event = localizeEvent(
      parse({ adapterId: 'opencode', name: 'ghost' }),
      opencodeBridge,
      index,
      ACTIVITY,
    );
    expect(event).toBeNull();
  });
});

describe('computeActivityStats', () => {
  function event(partial: Partial<RuntimeSkillEvent> & { skillName: string; at: string }): RuntimeSkillEvent {
    return {
      id: `${partial.skillName}-${partial.at}`,
      adapterId: 'opencode',
      agentDisplay: 'OpenCode',
      skillKey: `global||${partial.skillName}`,
      scope: 'global',
      task: null,
      taskId: null,
      source: 'model',
      phrase: null,
      triggerTerm: null,
      sessionId: null,
      cwd: null,
      ...partial,
    };
  }

  it('aggregates counts, days and multi-skill phrases', () => {
    const stats = computeActivityStats([
      event({ skillName: 'a', at: '2026-01-01T00:00:00.000Z', phrase: 'do the thing' }),
      event({ skillName: 'b', at: '2026-01-01T01:00:00.000Z', phrase: 'do the thing' }),
      event({ skillName: 'a', at: '2026-01-02T00:00:00.000Z', phrase: 'other' }),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.uniqueSkills).toBe(2);
    expect(stats.bySkill[0]).toMatchObject({ label: 'a', count: 2 });
    expect(stats.byDay).toEqual([
      { day: '2026-01-01', count: 2 },
      { day: '2026-01-02', count: 1 },
    ]);
    expect(stats.phraseConflicts).toHaveLength(1);
    expect(stats.phraseConflicts[0]?.skills.sort()).toEqual([
      'global||a',
      'global||b',
    ]);
  });
});

describe('BridgeService', () => {
  it('installs and uninstalls the OpenCode plugin reversibly', async () => {
    const home = await tempDir('skillcat-home-');
    const configDir = await tempDir('skillcat-config-');
    await mkdir(join(home, '.config', 'opencode'), { recursive: true });

    const service = new BridgeService({ configDir, homeDir: home, platform: 'darwin' });
    await service.load();

    const before = await service.statuses();
    expect(before[0]).toMatchObject({ id: 'opencode', available: true, installed: false });

    await service.install('opencode');
    const pluginPath = join(home, '.config', 'opencode', 'plugins', 'skillcat-bridge.ts');
    expect(await readFile(pluginPath, 'utf8')).toContain(OPENCODE_MARKER);
    expect(service.isInstalled('opencode')).toBe(true);

    const manifest = JSON.parse(await readFile(integrationsFilePath(configDir), 'utf8'));
    expect(manifest.opencode.adapterId).toBe('opencode');

    await service.uninstall('opencode');
    expect(service.isInstalled('opencode')).toBe(false);
    await expect(readFile(pluginPath, 'utf8')).rejects.toThrow();
  });

  it('refuses to overwrite a non-SkillCat plugin file', async () => {
    const home = await tempDir('skillcat-home-');
    const configDir = await tempDir('skillcat-config-');
    const plugins = join(home, '.config', 'opencode', 'plugins');
    await mkdir(plugins, { recursive: true });
    await writeFile(join(plugins, 'skillcat-bridge.ts'), '// user file');

    const service = new BridgeService({ configDir, homeDir: home, platform: 'darwin' });
    await service.load();
    await expect(service.install('opencode')).rejects.toThrow(/refusing to overwrite/);
  });

  it('ingests the spool, matches the catalog and clears the spool', async () => {
    const home = await tempDir('skillcat-home-');
    const configDir = await tempDir('skillcat-config-');
    const service = new BridgeService({ configDir, homeDir: home, platform: 'darwin' });
    await service.load();
    service.setActivitySettings(ACTIVITY);
    service.setCatalog([record({ name: 'pdf' })]);

    await writeFile(
      runtimeSpoolFilePath(configDir),
      `${JSON.stringify({ adapterId: 'opencode', name: 'pdf', phrase: 'make pdf' })}\n` +
        `${JSON.stringify({ adapterId: 'opencode', name: 'ghost' })}\n`,
    );

    const { added } = await service.ingest();
    expect(added).toHaveLength(1);
    expect(added[0]?.skillName).toBe('pdf');
    expect(service.activityStats().unmatched).toBe(1);

    const persisted = JSON.parse(await readFile(runtimeEventsFilePath(configDir), 'utf8'));
    expect(persisted).toHaveLength(1);
    expect(await readFile(runtimeSpoolFilePath(configDir), 'utf8')).toBe('');
  });

  it('trims events outside the retention window on load', async () => {
    const home = await tempDir('skillcat-home-');
    const configDir = await tempDir('skillcat-config-');
    await writeFile(
      runtimeEventsFilePath(configDir),
      JSON.stringify([
        {
          id: 'old',
          adapterId: 'opencode',
          agentDisplay: 'OpenCode',
          skillName: 'pdf',
          skillKey: 'global||pdf',
          scope: 'global',
          task: null,
          taskId: null,
          source: 'model',
          phrase: null,
          triggerTerm: null,
          sessionId: null,
          cwd: null,
          at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]),
    );

    const service = new BridgeService({ configDir, homeDir: home, platform: 'darwin' });
    await service.load();
    expect(service.activityEvents()).toHaveLength(0);
  });

  it('skips ingestion entirely when activity recording is disabled', async () => {
    const home = await tempDir('skillcat-home-');
    const configDir = await tempDir('skillcat-config-');
    const service = new BridgeService({ configDir, homeDir: home, platform: 'darwin' });
    await service.load();
    service.setActivitySettings({ ...ACTIVITY, enabled: false });
    service.setCatalog([record({ name: 'pdf' })]);
    await writeFile(
      runtimeSpoolFilePath(configDir),
      `${JSON.stringify({ adapterId: 'opencode', name: 'pdf' })}\n`,
    );
    const { added } = await service.ingest();
    expect(added).toHaveLength(0);
  });

});
