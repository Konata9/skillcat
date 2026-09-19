// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Finding, SkillRecord } from '@skillcat/core';
import type { SkillCatApi, Snapshot } from '@shared/contract';
import { ApiProvider } from '../api';
import { App } from '../App';
import { I18nProvider } from '../lib/i18n';

function record(partial: Partial<SkillRecord> & { name: string }): SkillRecord {
  return {
    scope: 'global',
    path: `/tmp/skills/${partial.name}`,
    description: 'Use when doing work.',
    frontmatter: {},
    body: '# body',
    bodyTruncated: false,
    source: 'owner/repo',
    sourceUrl: null,
    sourceType: 'github',
    agentsDeclared: [],
    lock: { source: 'owner/repo', sourceType: 'github' },
    links: [],
    contentHash: 'a'.repeat(64),
    files: [{ relativePath: 'SKILL.md', size: 100, kind: 'skill-md' }],
    sizeBytes: 100,
    triggers: { positive: [], negative: [], intents: [], hasWhenSignal: true },
    internal: false,
    installedAt: null,
    updatedAt: null,
    mtimeMs: Date.now(),
    ...partial,
  };
}

const finding: Finding = {
  id: 'trigger-overlap:alpha:beta',
  rule: 'trigger-overlap',
  severity: 'info',
  confidence: 'heuristic',
  title: { code: 'finding.triggerOverlap.title', params: { a: 'alpha', b: 'beta' } },
  detail: {
    code: 'finding.triggerOverlap.detail',
    params: { score: 40, cosine: 50, jaccard: 30, shared: ['润色'] },
  },
  suggestion: { code: 'finding.triggerOverlap.suggestion' },
  skills: [],
  evidence: ['润色'],
  score: 0.4,
};

function snapshot(): Snapshot {
  return {
    loading: false,
    scannedAt: new Date().toISOString(),
    global: [record({ name: 'alpha' }), record({ name: 'beta' })],
    projects: [],
    orphans: [],
    findings: [finding],
    projectErrors: [],
    config: {
      version: 1,
      roots: ['/tmp/workspace'],
      projects: [],
      recent: [],
      skillsCommand: null,
      proxy: { url: '', bypass: '' },
      thresholds: { overlap: 0.3, duplicate: 0.5 },
      showInternal: false,
      maxScanDepth: 3,
      customSkillDirs: [],
    },
    configPath: '/tmp/config/config.json',
    cliAvailable: true,
    cliSource: 'path',
  };
}

function makeApi(): SkillCatApi {
  const value = snapshot();
  return {
    getSnapshot: vi.fn(async () => value),
    refresh: vi.fn(async () => {}),
    listProjects: vi.fn(async () => []),
    addProject: vi.fn(async () => {}),
    removeProject: vi.fn(async () => {}),
    setProjectPinned: vi.fn(async () => {}),
    setRoots: vi.fn(async () => {}),
    setSettings: vi.fn(async () => {}),
    getAnnotation: vi.fn(async () => null),
    saveAnnotation: vi.fn(async () => {}),
    searchRemote: vi.fn(async () => []),
    startOp: vi.fn(async () => ({ opId: 'op-1' })),
    cancelOp: vi.fn(async () => {}),
    openSkill: vi.fn(async () => {}),
    revealSkill: vi.fn(async () => {}),
    pickDirectory: vi.fn(async () => null),
    openConfig: vi.fn(async () => {}),
    revealConfig: vi.fn(async () => {}),
    reloadConfig: vi.fn(async () => {}),
    doctor: vi.fn(async () => ({
      ok: true,
      configDir: '/tmp/config',
      cli: { command: ['npx', '-y', 'skills'], version: '1.0.0' },
      proxy: null,
      lockFiles: [],
      warnings: [],
    })),
    onStateChanged: vi.fn(() => () => {}),
    onOpEvent: vi.fn(() => () => {}),
  };
}

function renderApp(api: SkillCatApi) {
  return render(
    <I18nProvider>
      <ApiProvider api={api}>
        <App />
      </ApiProvider>
    </I18nProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.setItem('skillcat-locale', 'zh');
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
    window.localStorage.clear();
  });

  it('renders skills and switches tabs', async () => {
    const api = makeApi();
    renderApp(api);

    expect(await screen.findByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();

    fireEvent.click(screen.getByText('冲突'));
    expect((await screen.findAllByText('alpha 与 beta 触发词可能重叠')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('设置'));
    expect(await screen.findByText('扫描根目录（每行一个，用于自动发现项目）')).toBeTruthy();
  });

  it('opens the update confirm modal and starts an operation', async () => {
    const api = makeApi();
    renderApp(api);

    fireEvent.click(await screen.findByText('alpha'));
    fireEvent.click(screen.getByRole('button', { name: '更新' }));
    expect(await screen.findByText(/将 alpha 更新到最新版本/)).toBeTruthy();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '更新' }));
    await waitFor(() => {
      expect(api.startOp).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'update', names: ['alpha'], scope: 'global' }),
      );
    });
  });

  it('defaults to light theme and toggles to dark', async () => {
    const api = makeApi();
    renderApp(api);

    await screen.findByText('alpha');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '切换到暗色主题' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('skillcat-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: '切换到亮色主题' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('switches the UI language between Chinese and English', async () => {
    const api = makeApi();
    renderApp(api);

    await screen.findByText('alpha');
    expect(screen.getByText('作用域')).toBeTruthy();
    expect(document.documentElement.lang).toBe('zh-CN');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));

    expect(await screen.findByText('Scopes')).toBeTruthy();
    expect(screen.getByText('Conflicts')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('skillcat-locale')).toBe('en');

    // The Settings page also exposes a language selector.
    fireEvent.click(screen.getByText('Settings'));
    const select = await screen.findByRole('combobox', { name: 'Language' });
    fireEvent.change(select, { target: { value: 'zh' } });

    expect(await screen.findByText('作用域')).toBeTruthy();
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(window.localStorage.getItem('skillcat-locale')).toBe('zh');
  });

  it('searches remote skills and offers install', async () => {
    const api = makeApi();
    vi.mocked(api.searchRemote).mockResolvedValue([
      { name: 'pdf', slug: 'anthropics/skills/pdf', source: 'anthropics/skills', installs: 3400 },
    ]);
    renderApp(api);

    fireEvent.click(await screen.findByText('搜索'));
    fireEvent.change(screen.getByPlaceholderText(/搜索 skills.sh/), {
      target: { value: 'pdf' },
    });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: '搜索' }));

    expect(await screen.findByText('pdf')).toBeTruthy();
    fireEvent.click(screen.getByText('安装'));
    expect(await screen.findByText(/anthropics\/skills@pdf/)).toBeTruthy();
  });
});
