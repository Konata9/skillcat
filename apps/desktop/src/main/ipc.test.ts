import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SkillManager } from '@skillcat/core';
import { CH, type OpEvent, type Snapshot } from '../shared/contract';
import { registerIpc, type IpcMainLike } from './ipc';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

const originalHome = process.env.HOME;
const originalConfig = process.env.SKILLCAT_CONFIG_DIR;
const events: Array<{ channel: string; payload: unknown }> = [];
let manager: SkillManager;
let handlers: Map<string, Handler>;
let projectRoot: string;
let configDir: string;

function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return Promise.resolve(handler(null, ...args) as T);
}

function skillMd(name: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: Use when ${name} work happens.`,
    `when_to_use: ${name} trigger, ${name} keyword`,
    '---',
    `# ${name}`,
    'Body',
  ].join('\n');
}

beforeAll(async () => {
  const fakeHome = await mkdtemp(join(tmpdir(), 'skillcat-ipc-home-'));
  configDir = await mkdtemp(join(tmpdir(), 'skillcat-ipc-config-'));
  projectRoot = await mkdtemp(join(tmpdir(), 'skillcat-ipc-projects-'));

  await mkdir(join(fakeHome, '.agents', 'skills', 'alpha'), { recursive: true });
  await writeFile(join(fakeHome, '.agents', 'skills', 'alpha', 'SKILL.md'), skillMd('alpha'));

  const project = join(projectRoot, 'demo-project');
  await mkdir(join(project, '.agents', 'skills', 'beta'), { recursive: true });
  await writeFile(join(project, '.agents', 'skills', 'beta', 'SKILL.md'), skillMd('beta'));

  const customProject = join(projectRoot, 'custom-project');
  await mkdir(join(customProject, '.my-skills', 'gamma'), { recursive: true });
  await writeFile(join(customProject, '.my-skills', 'gamma', 'SKILL.md'), skillMd('gamma'));

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

  process.env.HOME = fakeHome;
  process.env.SKILLCAT_CONFIG_DIR = configDir;

  manager = new SkillManager({ configDir });
  await manager.init();

  handlers = new Map();
  const ipc: IpcMainLike = {
    handle: (channel, listener) => {
      handlers.set(channel, listener);
    },
  };
  registerIpc(manager, {
    ipc,
    broadcast: (channel, payload) => events.push({ channel, payload }),
    openSkill: async () => {},
    revealSkill: () => {},
    openConfig: async () => {},
    revealConfig: () => {},
    pickDirectory: async () => null,
    applyProxy: async () => {},
  });

  await manager.refresh();
});

afterAll(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalConfig === undefined) delete process.env.SKILLCAT_CONFIG_DIR;
  else process.env.SKILLCAT_CONFIG_DIR = originalConfig;
});

describe('ipc contract', () => {
  it('returns a snapshot of scanned skills', async () => {
    const snapshot = await call<Snapshot>(CH.snapshot);
    expect(snapshot.global.map((record) => record.name)).toContain('alpha');
    expect(snapshot.cliAvailable).toBe(true);
    expect(snapshot.config.skillsCommand).toEqual(['true']);
    expect(snapshot.configPath).toBe(join(configDir, 'config.json'));
  });

  it('discovers projects after setting roots', async () => {
    await call(CH.rootsSet, [projectRoot]);
    const snapshot = await call<Snapshot>(CH.snapshot);
    const project = snapshot.projects.find((entry) => entry.path.endsWith('demo-project'));
    expect(project?.records.map((record) => record.name)).toContain('beta');
  });

  it('scans custom skill dirs from settings', async () => {
    await call(CH.settingsSet, { customSkillDirs: ['.my-skills'] });

    const snapshot = await call<Snapshot>(CH.snapshot);
    expect(snapshot.config.customSkillDirs).toEqual(['.my-skills']);
    const project = snapshot.projects.find((entry) => entry.path.endsWith('custom-project'));
    expect(project?.records.map((record) => record.name)).toContain('gamma');
  });

  it('reloads config.json after an external edit', async () => {
    const configPath = join(configDir, 'config.json');
    const raw = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    await writeFile(configPath, JSON.stringify({ ...raw, customSkillDirs: [] }));

    await call(CH.configReload);

    const snapshot = await call<Snapshot>(CH.snapshot);
    expect(snapshot.config.customSkillDirs).toEqual([]);
  });

  it('round-trips trigger annotations', async () => {
    const ref = { scope: 'global' as const, name: 'alpha' };
    await call(CH.annotationSave, ref, {
      added: [{ text: '周报', kind: 'positive' }],
      removed: [],
    });
    const annotation = await call<{ added: Array<{ text: string }> } | null>(CH.annotationGet, ref);
    expect(annotation?.added[0]?.text).toBe('周报');

    await call(CH.annotationSave, ref, null);
    const cleared = await call(CH.annotationGet, ref);
    expect(cleared).toBeNull();
  });

  it('runs operations and broadcasts lifecycle events', async () => {
    events.length = 0;
    const { opId } = await call<{ opId: string }>(CH.opStart, {
      kind: 'update',
      names: ['alpha'],
      scope: 'global',
      title: 'update alpha',
    });
    expect(opId).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 500));
    const opEvents = events
      .filter((event) => event.channel === CH.opEvent)
      .map((event) => event.payload as OpEvent);
    const done = opEvents.find((event) => event.done);
    expect(done?.ok).toBe(true);
    expect(events.some((event) => event.channel === CH.stateChanged)).toBe(true);
  });
});
