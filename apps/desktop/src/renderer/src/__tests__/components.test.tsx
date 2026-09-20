// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, DoctorReport, RemoteSkill, SkillRecord } from '@skillcat/core';
import { I18nProvider } from '../lib/i18n';
import { ConfirmFlows } from '../components/ConfirmFlows';
import { SkillList } from '../components/SkillList';
import { TriggersPanel } from '../components/TriggersPanel';
import { SettingsView } from '../views/SettingsView';

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
    mtimeMs: Date.now(),
    ...partial,
  };
}

function wrap(node: React.ReactElement): React.ReactElement {
  return <I18nProvider>{node}</I18nProvider>;
}

beforeEach(() => {
  window.localStorage.setItem('skillcat-locale', 'zh');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('SkillList', () => {
  it('renders skills and reports selection', () => {
    const onSelect = vi.fn();
    render(
      wrap(
        <SkillList
          records={[
            record({ name: 'alpha', description: 'Alpha skill' }),
            record({
              name: 'beta',
              description: 'Beta skill',
              lock: { source: 'owner/repo', sourceType: 'github' },
            }),
          ]}
          selectedKey="global||alpha"
          onSelect={onSelect}
        />,
      ),
    );

    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.getByText('手动')).toBeTruthy();

    screen.getByText('beta').click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]?.name).toBe('beta');
  });

  it('distinguishes an empty scope from an empty filter result', () => {
    const { unmount } = render(
      wrap(<SkillList records={[]} selectedKey={null} onSelect={() => {}} />),
    );
    expect(screen.getByText('当前位置还没有 skill')).toBeTruthy();
    unmount();

    render(wrap(<SkillList records={[]} selectedKey={null} onSelect={() => {}} filterActive />));
    expect(screen.getByText('没有匹配的 skill')).toBeTruthy();
  });
});

describe('TriggersPanel', () => {
  it('renders positive, negative and user terms', () => {
    render(
      wrap(
        <TriggersPanel
          triggers={{
            positive: [
              { text: '润色', norm: '润色', kind: 'positive', source: 'when_to_use', weight: 1 },
              {
                text: '周报',
                norm: '周报',
                kind: 'positive',
                source: 'user',
                weight: 1.2,
                user: true,
              },
            ],
            negative: [
              {
                text: 'debugging',
                norm: 'debugging',
                kind: 'negative',
                source: 'description',
                weight: 0.7,
              },
            ],
            intents: ['polish articles'],
            hasWhenSignal: true,
          }}
        />,
      ),
    );

    expect(screen.getByText('润色')).toBeTruthy();
    expect(screen.getByText('周报')).toBeTruthy();
    expect(screen.getByText('debugging')).toBeTruthy();
    expect(screen.getByText('polish articles')).toBeTruthy();
    expect(screen.getByText('user')).toBeTruthy();
  });

  it('warns when no when-signal exists', () => {
    render(
      wrap(
        <TriggersPanel
          triggers={{ positive: [], negative: [], intents: [], hasWhenSignal: false }}
        />,
      ),
    );
    expect(screen.getByText(/未检测到/)).toBeTruthy();
  });
});

describe('ConfirmFlows install targets', () => {
  const skill: RemoteSkill = {
    name: 'pdf',
    slug: 'anthropics/skills/pdf',
    source: 'anthropics/skills',
    installs: 3400,
  };

  const globalScope = { key: 'global', label: '全局', path: null, count: 0 };
  const demo = { key: 'project:/tmp/demo', label: 'demo', path: '/tmp/demo', count: 0 };
  const other = { key: 'project:/tmp/other', label: 'other', path: '/tmp/other', count: 0 };
  const scopes = [globalScope, demo, other];

  function renderInstall(
    activeScope: (typeof scopes)[number],
    availableScopes: (typeof scopes)[number][],
    onStartOp: (request: unknown) => Promise<void>,
  ): void {
    render(
      wrap(
        <ConfirmFlows
          state={{ kind: 'install', skill }}
          activeScope={activeScope}
          scopes={availableScopes}
          onStartOp={onStartOp as never}
          onRemoveProject={async () => {}}
          onReevaluate={() => {}}
          onClose={() => {}}
        />,
      ),
    );
  }

  it('defaults to the active project and installs project-scoped', async () => {
    const onStartOp = vi.fn(async () => {});
    renderInstall(demo, scopes, onStartOp);

    fireEvent.click(screen.getByRole('button', { name: '安装' }));
    await waitFor(() => {
      expect(onStartOp).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'add',
          source: 'anthropics/skills@pdf',
          targets: [{ scope: 'project', cwd: '/tmp/demo' }],
        }),
      );
    });
  });

  it('switches to a global install', async () => {
    const onStartOp = vi.fn(async () => {});
    renderInstall(demo, scopes, onStartOp);

    fireEvent.click(screen.getByRole('button', { name: /^全局/ }));
    fireEvent.click(screen.getByRole('button', { name: '安装' }));
    await waitFor(() => {
      expect(onStartOp).toHaveBeenCalledWith(
        expect.objectContaining({ targets: [{ scope: 'global' }] }),
      );
    });
  });

  it('installs into multiple selected projects', async () => {
    const onStartOp = vi.fn(async () => {});
    renderInstall(demo, scopes, onStartOp);

    fireEvent.click(screen.getByRole('checkbox', { name: /^other/ }));
    fireEvent.click(screen.getByRole('button', { name: '安装' }));
    await waitFor(() => {
      expect(onStartOp).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: [
            { scope: 'project', cwd: '/tmp/demo' },
            { scope: 'project', cwd: '/tmp/other' },
          ],
        }),
      );
    });
  });

  it('defaults to global and disables the project option when there are no projects', () => {
    renderInstall(globalScope, [globalScope], vi.fn(async () => {}));
    expect((screen.getByRole('button', { name: /^项目/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: '安装' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('SettingsView LLM', () => {
  function llmConfig(): AppConfig {
    return {
      version: 1,
      roots: [],
      projects: [],
      recent: [],
      skillsCommand: null,
      proxy: { url: '', bypass: '' },
      thresholds: { overlap: 0.3, duplicate: 0.5 },
      showInternal: false,
      maxScanDepth: 3,
      customSkillDirs: [],
      llm: {
        enabled: true,
        provider: 'openai',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      },
    };
  }

  function renderLlm(config: AppConfig, onTestLlm = vi.fn(async () => ({ ok: true, status: 200, message: 'ok' }))) {
    render(
      wrap(
        <SettingsView
          config={config}
          configPath="/tmp/config/config.json"
          appVersion="0.1.0"
          cliAvailable
          cliSource="path"
          onSave={async () => {}}
          onStatus={() => {}}
          onPickDirectory={async () => null}
          onOpenConfig={async () => {}}
          onRevealConfig={() => {}}
          onReloadConfig={async () => {}}
          onTestLlm={onTestLlm}
          onCheckUpdate={async () => ({
            configured: false,
            repo: '',
            current: '0.1.0',
            latest: null,
            hasUpdate: false,
            url: null,
            publishedAt: null,
          })}
          onOpenExternal={async () => {}}
          onDoctor={async () => ({
            ok: true,
            configDir: '/tmp/config',
            cli: { command: null, version: null },
            proxy: null,
            lockFiles: [],
            warnings: [],
          })}
        />,
      ),
    );
    fireEvent.click(screen.getByText('大模型'));
    return onTestLlm;
  }

  it('applies provider presets and tests the connection', async () => {
    const onTestLlm = renderLlm(llmConfig());

    fireEvent.change(screen.getByRole('combobox', { name: '服务商' }), {
      target: { value: 'deepseek' },
    });
    expect(screen.getByDisplayValue('https://api.deepseek.com/v1')).toBeTruthy();
    expect(screen.getByDisplayValue('deepseek-chat')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    await waitFor(() => {
      expect(onTestLlm).toHaveBeenCalledWith({
        enabled: true,
        provider: 'deepseek',
        apiKey: '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      });
    });
    expect(await screen.findByText(/连接成功/)).toBeTruthy();
  });

  it('hides the configuration until the model is enabled', () => {
    const disabled = llmConfig();
    disabled.llm.enabled = false;
    renderLlm(disabled);

    expect(screen.queryByRole('combobox', { name: '服务商' })).toBeNull();
    expect(screen.queryByRole('button', { name: '测试连接' })).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: '启用大模型' }));

    expect(screen.getByRole('combobox', { name: '服务商' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '测试连接' })).toBeTruthy();
  });
});

describe('SettingsView proxy', () => {
  function config(proxy: { url: string; bypass: string }): AppConfig {
    return {
      version: 1,
      roots: ['/tmp/workspace'],
      projects: [],
      recent: [],
      skillsCommand: null,
      proxy,
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
    };
  }

  it('reveals the proxy fields only when enabled and saves the toggle state', async () => {
    const onSave = vi.fn(async () => {});
    const view = (value: AppConfig): React.ReactElement => (
      <SettingsView
        config={value}
        configPath="/tmp/config/config.json"
        appVersion="0.1.0"
        cliAvailable
        cliSource="path"
        onSave={onSave}
        onStatus={() => {}}
        onPickDirectory={async () => null}
        onOpenConfig={async () => {}}
        onRevealConfig={() => {}}
        onReloadConfig={async () => {}}
        onTestLlm={async () => ({ ok: true, status: 200, message: 'ok' })}
        onCheckUpdate={async () => ({
          configured: false,
          repo: '',
          current: '0.1.0',
          latest: null,
          hasUpdate: false,
          url: null,
          publishedAt: null,
        })}
        onOpenExternal={async () => {}}
        onDoctor={async () => ({
          ok: true,
          configDir: '/tmp/config',
          cli: { command: ['npx', '-y', 'skills'], version: '1.0.0' },
          proxy: null,
          lockFiles: [],
          warnings: [],
        })}
      />
    );

    const { rerender } = render(wrap(view(config({ url: '', bypass: '' }))));
    fireEvent.click(screen.getByText('网络'));
    const toggle = screen.getByRole('switch', { name: '启用代理' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByPlaceholderText('127.0.0.1:7890')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.change(screen.getByPlaceholderText('127.0.0.1:7890'), {
      target: { value: '127.0.0.1:7890' },
    });
    fireEvent.change(screen.getByPlaceholderText('localhost, 127.0.0.1, .internal'), {
      target: { value: 'localhost' },
    });
    expect(screen.getByText('生效地址：http://127.0.0.1:7890')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '保存并刷新' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ proxy: { url: '127.0.0.1:7890', bypass: 'localhost' } }),
      );
    });

    rerender(wrap(view(config({ url: '127.0.0.1:7890', bypass: 'localhost' }))));
    expect(screen.getByRole('switch', { name: '启用代理' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('switch', { name: '启用代理' }));
    expect(screen.queryByPlaceholderText('127.0.0.1:7890')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '保存并刷新' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ proxy: { url: '', bypass: '' } }),
      );
    });
  });
});
