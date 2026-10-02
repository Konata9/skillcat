import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SkillManager } from '@skillcat/core';
import { CH, EVENTS, type OpEvent, type Snapshot } from '../../shared/contract';
import { registerIpc, type IpcMainLike } from '../ipc';

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
    appVersion: '0.1.0',
    checkUpdate: async () => ({
      configured: false,
      repo: '',
      current: '0.1.0',
      latest: null,
      hasUpdate: false,
      url: null,
      publishedAt: null,
    }),
    openExternal: async () => {},
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
    expect(snapshot.evaluation).toBeNull();
    expect(snapshot.evaluating).toBe(false);
  });

  it('refuses to evaluate without a configured model', async () => {
    await expect(call(CH.evaluate, 'zh')).rejects.toThrow(/not configured/);
  });

  it('refuses to review candidates without a configured model', async () => {
    await expect(call(CH.reviewCandidates, 'zh')).rejects.toThrow(/not configured/);
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
    await vi.waitFor(() => {
      const done = events
        .filter((event) => event.channel === EVENTS.opEvent)
        .map((event) => event.payload as OpEvent)
        .find((event) => event.done);
      expect(done?.ok).toBe(true);
    });
    expect(events.some((event) => event.channel === EVENTS.stateChanged)).toBe(true);
  });

  it('runs a multi-target add as a single operation', async () => {
    events.length = 0;
    const { opId } = await call<{ opId: string }>(CH.opStart, {
      kind: 'add',
      source: 'owner/repo@skill',
      targets: [{ scope: 'global' }, { scope: 'project', cwd: projectRoot }],
      title: 'add owner/repo@skill',
    });
    expect(opId).toBeTruthy();

    let opEvents: OpEvent[] = [];
    await vi.waitFor(() => {
      opEvents = events
        .filter((event) => event.channel === EVENTS.opEvent)
        .map((event) => event.payload as OpEvent);
      expect(opEvents.find((event) => event.done)?.ok).toBe(true);
    });
    const lines = opEvents
      .filter((event) => event.line !== undefined)
      .map((event) => event.line);
    expect(lines).toContain('# global');
    expect(lines).toContain(`# ${projectRoot}`);
  });

  it('lists bridges and installs / uninstalls reversibly', async () => {
    const before = await call<Array<{ id: string; installed: boolean }>>(CH.bridgesList);
    expect(before.some((bridge) => bridge.id === 'opencode')).toBe(true);

    await call(CH.bridgesInstall, 'opencode');
    const installed = await call<Array<{ id: string; installed: boolean }>>(CH.bridgesList);
    expect(installed.find((bridge) => bridge.id === 'opencode')?.installed).toBe(true);

    await call(CH.bridgesUninstall, 'opencode');
    const after = await call<Array<{ id: string; installed: boolean }>>(CH.bridgesList);
    expect(after.find((bridge) => bridge.id === 'opencode')?.installed).toBe(false);
  });

  it('ingests and clears bridge trigger events', async () => {
    await writeFile(
      join(configDir, 'runtime-spool.jsonl'),
      `${JSON.stringify({
        v: 1,
        adapterId: 'opencode',
        kind: 'tool',
        name: 'alpha',
        phrase: 'do alpha work',
        task: 'Task A',
        ts: Date.now(),
      })}\n`,
    );
    await call(CH.refresh);

    const activityEvents = await call<Array<{ skillName: string }>>(CH.activityEvents);
    expect(activityEvents.some((event) => event.skillName === 'alpha')).toBe(true);

    const stats = await call<{ total: number }>(CH.activityStats);
    expect(stats.total).toBeGreaterThan(0);

    const snapshot = await call<Snapshot>(CH.snapshot);
    expect(Object.keys(snapshot.activityCounts).length).toBeGreaterThan(0);

    await call(CH.activityClear);
    expect(await call<Array<unknown>>(CH.activityEvents)).toHaveLength(0);
  });

  it('registers, pins, lists and removes projects', async () => {
    const path = join(projectRoot, 'registry-project');
    await mkdir(path, { recursive: true });

    await call(CH.projectsAdd, path);
    let projects = await call<Array<{ path: string; registered: boolean; pinned: boolean }>>(
      CH.projectsList,
    );
    expect(projects.find((entry) => entry.path === path)).toMatchObject({
      registered: true,
      pinned: false,
    });

    await call(CH.projectsPin, path, true);
    projects = await call(CH.projectsList);
    expect(projects.find((entry) => entry.path === path)?.pinned).toBe(true);

    await call(CH.projectsRemove, path);
    projects = await call(CH.projectsList);
    expect(projects.some((entry) => entry.path === path)).toBe(false);
  });

  it('persists thresholds, llm and activity settings', async () => {
    await call(CH.settingsSet, {
      thresholds: { overlap: 0.42, duplicate: 0.6 },
      llm: {
        enabled: true,
        provider: 'openai',
        apiKey: 'sk-x',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      },
      activity: { enabled: true, storePhrase: true, retentionDays: 60, maxPhraseChars: 200 },
    });

    const snapshot = await call<Snapshot>(CH.snapshot);
    expect(snapshot.config.thresholds.overlap).toBe(0.42);
    expect(snapshot.config.thresholds.duplicate).toBe(0.6);
    expect(snapshot.config.llm.apiKey).toBe('sk-x');
    expect(snapshot.config.activity.retentionDays).toBe(60);
  });

  it('returns a doctor report for the configured directory', async () => {
    const report = await call<{ configDir: string; warnings: Array<{ code: string }> }>(CH.doctor);
    expect(report.configDir).toBe(configDir);
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it('rejects non-https external URLs', async () => {
    await expect(call(CH.openExternal, 'http://example.com')).rejects.toThrow(/https/);
    await expect(call(CH.openExternal, 'not a url')).rejects.toThrow();
  });

  it('emits a terminal event and releases the op when it fails', async () => {
    await call(CH.settingsSet, { skillsCommand: ['false'] });
    events.length = 0;

    await call(CH.opStart, {
      kind: 'update',
      names: ['alpha'],
      scope: 'global',
      title: 'failing update',
    });

    await vi.waitFor(() => {
      const done = events
        .filter((event) => event.channel === EVENTS.opEvent)
        .map((event) => event.payload as OpEvent)
        .find((event) => event.done);
      expect(done?.ok).toBe(false);
    });

    // Restore a passing CLI for any later test.
    await call(CH.settingsSet, { skillsCommand: ['true'] });
  });
});
