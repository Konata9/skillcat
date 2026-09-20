// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvaluationEvent, EvaluationReport, Finding, SkillRecord } from '@skillcat/core';
import type { SkillCatApi, Snapshot } from '@shared/contract';
import { ApiProvider } from '../api';
import { App } from '../App';
import { resetLeaderboardCache } from '../hooks/useLeaderboard';
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
    version: '0.1.0',
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
      llm: {
        enabled: false,
        provider: 'openai',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      },
    },
    configPath: '/tmp/config/config.json',
    cliAvailable: true,
    cliSource: 'path',
    evaluation: null,
    evaluationStale: false,
    verdictsAt: null,
    verdictsStale: false,
    evaluating: false,
    reviewing: false,
    evaluationProgress: null,
    evaluationError: null,
  };
}

const evaluationFixture: EvaluationReport = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  provider: 'openai',
  model: 'gpt-4o',
  locale: 'zh',
  signature: 'sig',
  summary: 'Overall summary.',
  averageScore: 60,
  scores: [
    {
      skill: { name: 'alpha', scope: 'global', path: '/tmp/skills/alpha' },
      score: 40,
      grade: 'D',
      summary: 'Vague.',
      strengths: [],
      issues: ['missing boundaries'],
    },
    {
      skill: { name: 'beta', scope: 'global', path: '/tmp/skills/beta' },
      score: 80,
      grade: 'B',
      summary: 'Solid.',
      strengths: ['clear'],
      issues: [],
    },
  ],
};

const aiAnnotatedFinding: Finding = {
  id: 'trigger-overlap:global||alpha:global||beta',
  rule: 'trigger-overlap',
  severity: 'info',
  confidence: 'heuristic',
  title: { code: 'finding.triggerOverlap.title', params: { a: 'alpha', b: 'beta' } },
  detail: {
    code: 'finding.triggerOverlap.detail',
    params: { score: 40, cosine: 50, jaccard: 30, shared: ['润色'] },
  },
  skills: [
    { name: 'alpha', scope: 'global', path: '/tmp/skills/alpha' },
    { name: 'beta', scope: 'global', path: '/tmp/skills/beta' },
  ],
  evidence: ['润色'],
  ai: { verdict: 'false-positive', detail: 'Same purpose.', suggestion: 'Merge them.' },
};

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
    leaderboard: vi.fn(async () => []),
    remoteSkillDetail: vi.fn(async () => ({
      name: '',
      source: '',
      slug: '',
      description: '',
      license: null,
      frontmatter: {},
      body: '',
      files: [],
      installCommand: '',
      hash: null,
    })),
    evaluate: vi.fn(async () => {}),
    reviewCandidates: vi.fn(async () => {}),
    testLlm: vi.fn(async () => ({ ok: true, status: 200, message: 'ok' })),
    checkUpdate: vi.fn(async () => ({
      configured: false,
      repo: '',
      current: '0.1.0',
      latest: null,
      hasUpdate: false,
      url: null,
      publishedAt: null,
    })),
    openExternal: vi.fn(async () => {}),
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
    onEvaluationEvent: vi.fn(() => () => {}),
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
    resetLeaderboardCache();
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

    fireEvent.click(screen.getByText('分析'));
    expect((await screen.findAllByText('alpha 与 beta 触发词可能重叠')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('设置'));
    fireEvent.click(await screen.findByText('扫描'));
    expect(await screen.findByText('扫描根目录（每行一个，用于自动发现项目）')).toBeTruthy();
  });

  it('opens the settings view with Cmd+,', async () => {
    const api = makeApi();
    renderApp(api);

    await screen.findByText('alpha');
    fireEvent.keyDown(window, { key: ',', metaKey: true });

    expect(await screen.findByText('通用')).toBeTruthy();
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
    expect(screen.getByText('位置')).toBeTruthy();
    expect(document.documentElement.lang).toBe('zh-CN');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));

    expect(await screen.findByText('Locations')).toBeTruthy();
    expect(screen.getByText('Analysis')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('skillcat-locale')).toBe('en');

    // The Settings page also exposes a language selector.
    fireEvent.click(screen.getByText('Settings'));
    const select = await screen.findByRole('combobox', { name: 'Language' });
    fireEvent.change(select, { target: { value: 'zh' } });

    expect(await screen.findByText('位置')).toBeTruthy();
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(window.localStorage.getItem('skillcat-locale')).toBe('zh');
  });

  it('gates the skill evaluation button on the LLM configuration', async () => {
    const api = makeApi();
    const base = snapshot();
    vi.mocked(api.getSnapshot).mockResolvedValue(base);
    const { unmount } = renderApp(api);

    fireEvent.click(await screen.findByText('分析'));
    const disabled = await screen.findByRole('button', { name: 'SKILL 评估' });
    expect((disabled as HTMLButtonElement).disabled).toBe(true);
    unmount();

    const configuredApi = makeApi();
    vi.mocked(configuredApi.getSnapshot).mockResolvedValue({
      ...base,
      config: {
        ...base.config,
        llm: { ...base.config.llm, enabled: true, apiKey: 'sk-test' },
      },
    });
    renderApp(configuredApi);

    fireEvent.click(await screen.findByText('分析'));
    const enabled = await screen.findByRole('button', { name: 'SKILL 评估' });
    expect((enabled as HTMLButtonElement).disabled).toBe(false);
  });

  it('merges AI verdicts into the analysis list', async () => {
    const api = makeApi();
    vi.mocked(api.getSnapshot).mockResolvedValue({
      ...snapshot(),
      findings: [aiAnnotatedFinding],
      evaluation: evaluationFixture,
      verdictsAt: '2026-01-01T00:00:00.000Z',
    });
    renderApp(api);

    fireEvent.click(await screen.findByText('分析'));

    // Overview is selected by default and shows the summary and scores.
    expect(await screen.findByText('Overall summary.')).toBeTruthy();
    expect(screen.getByText(/missing boundaries/)).toBeTruthy();

    // The heuristic finding carries the AI verdict.
    fireEvent.click(screen.getByText('alpha 与 beta 触发词可能重叠'));
    expect(screen.getAllByText('可能误报').length).toBeGreaterThan(0);
    expect(screen.getByText('Same purpose.')).toBeTruthy();
    expect(screen.getByText('Merge them.')).toBeTruthy();
  });

  it('runs candidate review from the toolbar', async () => {
    const api = makeApi();
    const base = snapshot();
    vi.mocked(api.getSnapshot).mockResolvedValue({
      ...base,
      config: { ...base.config, llm: { ...base.config.llm, enabled: true, apiKey: 'sk-test' } },
    });
    renderApp(api);

    fireEvent.click(await screen.findByText('分析'));
    fireEvent.click(await screen.findByRole('button', { name: 'AI 复核候选' }));
    expect(api.reviewCandidates).toHaveBeenCalled();
  });

  it('shows the live evaluation process log', async () => {
    const api = makeApi();
    let emit: ((event: EvaluationEvent) => void) | null = null;
    vi.mocked(api.onEvaluationEvent).mockImplementation((callback) => {
      emit = callback;
      return () => {};
    });
    vi.mocked(api.getSnapshot).mockResolvedValue({ ...snapshot(), evaluating: true });
    renderApp(api);

    fireEvent.click(await screen.findByText('分析'));

    await act(async () => {
      emit?.({ type: 'step', step: { code: 'eval.step.prepare', params: { count: 3 } } });
    });

    expect(await screen.findByText(/准备评估 3 个 skill/)).toBeTruthy();
  });

  it('confirms before overwriting an existing evaluation', async () => {
    const api = makeApi();
    const base = snapshot();
    vi.mocked(api.getSnapshot).mockResolvedValue({
      ...base,
      evaluation: evaluationFixture,
      config: { ...base.config, llm: { ...base.config.llm, enabled: true, apiKey: 'sk-test' } },
    });
    renderApp(api);

    fireEvent.click(await screen.findByText('分析'));
    fireEvent.click(await screen.findByRole('button', { name: 'SKILL 评估' }));

    expect(await screen.findByText(/将覆盖/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新评估' }));
    expect(api.evaluate).toHaveBeenCalled();
  });

  it('filters projects from the sidebar search', async () => {
    const api = makeApi();
    vi.mocked(api.getSnapshot).mockResolvedValue({
      ...snapshot(),
      projects: [
        { path: '/tmp/workspace/alpha-app', records: [] },
        { path: '/tmp/workspace/beta-tool', records: [] },
      ],
    });
    renderApp(api);

    expect(await screen.findByText('/tmp/workspace/alpha-app')).toBeTruthy();
    expect(screen.getByText('/tmp/workspace/beta-tool')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('搜索项目'), { target: { value: 'beta' } });

    expect(screen.queryByText('/tmp/workspace/alpha-app')).toBeNull();
    expect(screen.getByText('/tmp/workspace/beta-tool')).toBeTruthy();
  });

  it('shows the global loading bar while a scan is in progress', async () => {
    const api = makeApi();
    vi.mocked(api.getSnapshot).mockResolvedValue({ ...snapshot(), loading: true });
    renderApp(api);

    expect(await screen.findByRole('progressbar')).toBeTruthy();
  });

  it('offers rescan and deep scan from the refresh menu', async () => {
    const api = makeApi();
    renderApp(api);

    await screen.findByText('alpha');
    fireEvent.click(screen.getByRole('button', { name: '扫描选项' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /深度扫描/ }));

    expect(api.refresh).toHaveBeenCalledWith({ deep: true });
  });

  it('shows the all-time leaderboard by default', async () => {
    const api = makeApi();
    vi.mocked(api.leaderboard).mockResolvedValue([
      {
        name: 'pdf-tools',
        slug: 'acme/skills/pdf-tools',
        source: 'acme/skills',
        installs: 3_465_509,
        isOfficial: true,
      },
    ]);
    renderApp(api);

    fireEvent.click(await screen.findByText('搜索'));

    expect(await screen.findByText('pdf-tools')).toBeTruthy();
    expect(api.leaderboard).toHaveBeenCalledWith('all-time');
  });

  it('reuses the cached leaderboard when re-entering the search tab', async () => {
    const api = makeApi();
    vi.mocked(api.leaderboard).mockResolvedValue([
      {
        name: 'pdf-tools',
        slug: 'acme/skills/pdf-tools',
        source: 'acme/skills',
        installs: 3_465_509,
      },
    ]);
    renderApp(api);

    fireEvent.click(await screen.findByText('搜索'));
    expect(await screen.findByText('pdf-tools')).toBeTruthy();
    expect(api.leaderboard).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Skills'));
    fireEvent.click(screen.getByText('搜索'));

    expect(await screen.findByText('pdf-tools')).toBeTruthy();
    expect(api.leaderboard).toHaveBeenCalledTimes(1);
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

  it('opens the skill detail drawer with the skills.sh content', async () => {
    const api = makeApi();
    vi.mocked(api.searchRemote).mockResolvedValue([
      { name: 'pdf', slug: 'anthropics/skills/pdf', source: 'anthropics/skills', installs: 3400 },
    ]);
    vi.mocked(api.remoteSkillDetail).mockResolvedValue({
      name: 'pdf',
      source: 'anthropics/skills',
      slug: 'anthropics/skills/pdf',
      description: 'Use this skill for PDF work.',
      license: null,
      frontmatter: { name: 'pdf' },
      body: '# PDF Processing Guide',
      files: [
        { path: 'SKILL.md', contents: '' },
        { path: 'reference.md', contents: '' },
      ],
      installCommand: 'npx skills add https://github.com/anthropics/skills --skill pdf',
      hash: null,
    });
    renderApp(api);

    fireEvent.click(await screen.findByText('搜索'));
    fireEvent.change(screen.getByPlaceholderText(/搜索 skills.sh/), {
      target: { value: 'pdf' },
    });
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: '搜索' }));

    fireEvent.click(await screen.findByText('pdf'));

    expect(api.remoteSkillDetail).toHaveBeenCalledWith('anthropics/skills/pdf');
    expect(await screen.findByText('Use this skill for PDF work.')).toBeTruthy();
    expect(screen.getByText('# PDF Processing Guide')).toBeTruthy();
    expect(screen.getByText('reference.md')).toBeTruthy();
  });
});
