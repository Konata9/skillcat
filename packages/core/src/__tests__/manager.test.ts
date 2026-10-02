import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelCaller } from '../evaluation/evaluate.js';
import { SkillManager } from '../manager.js';

const originalHome = process.env.HOME;

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

function skillMd(name: string, extra = ''): string {
  return [
    '---',
    `name: ${name}`,
    `description: Use when ${name} work happens.`,
    `when_to_use: ${name} trigger, ${name} keyword`,
    extra,
    '---',
    `# ${name}`,
    'Body',
  ].join('\n');
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Writes global skills and returns a manager rooted at isolated temp dirs. */
async function setup(options: { caller?: ModelCaller } = {}): Promise<{
  manager: SkillManager;
  home: string;
  configDir: string;
}> {
  const home = await tempDir('skillcat-mgr-home-');
  const configDir = await tempDir('skillcat-mgr-config-');
  await mkdir(join(home, '.agents', 'skills', 'alpha'), { recursive: true });
  await mkdir(join(home, '.agents', 'skills', 'beta'), { recursive: true });
  await writeFile(join(home, '.agents', 'skills', 'alpha', 'SKILL.md'), skillMd('alpha'));
  await writeFile(join(home, '.agents', 'skills', 'beta', 'SKILL.md'), skillMd('beta'));

  process.env.HOME = home;
  process.env.SKILLCAT_CONFIG_DIR = configDir;

  // A cheap CLI keeps resolution offline; it exits 0 with no version output.
  await writeFile(
    join(configDir, 'config.json'),
    JSON.stringify({ version: 1, skillsCommand: ['true'] }),
  );

  const manager = new SkillManager({ configDir, modelCaller: options.caller });
  await manager.init();
  await manager.refresh();
  return { manager, home, configDir };
}

const llm = {
  enabled: true,
  provider: 'openai' as const,
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
};

const caller: ModelCaller = async ({ prompt }) => {
  if (prompt.startsWith('Score each')) {
    return {
      scores: [
        { id: 's1', score: 80, summary: 'Solid.', strengths: [], issues: [] },
        { id: 's2', score: 70, summary: 'Okay.', strengths: [], issues: [] },
      ],
    };
  }
  if (prompt.startsWith('Judge the following')) {
    return {
      verdicts: [
        {
          a: 's1',
          b: 's2',
          kind: 'trigger',
          verdict: 'confirmed',
          severity: 'warn',
          title: 'Overlap',
          detail: 'They overlap.',
          suggestion: 'Merge them.',
        },
      ],
    };
  }
  return { summary: 'Overall summary.' };
};

describe('SkillManager settings persistence', () => {
  it('persists thresholds, llm, activity and custom dirs to config.json', async () => {
    const { manager, configDir } = await setup();

    await manager.setThresholds({ overlap: 0.4 });
    await manager.setShowInternal(true);
    await manager.setCustomSkillDirs(['~/.my-skills', '.claude/skills']);
    await manager.setLlm(llm);
    await manager.setActivity({ enabled: false, storePhrase: false, retentionDays: 30, maxPhraseChars: 40 });

    const raw = JSON.parse(await readFile(join(configDir, 'config.json'), 'utf8'));
    expect(raw.thresholds.overlap).toBe(0.4);
    expect(raw.thresholds.duplicate).toBe(0.5);
    expect(raw.showInternal).toBe(true);
    expect(raw.customSkillDirs).toEqual(['~/.my-skills', '.claude/skills']);
    expect(raw.llm).toMatchObject({ enabled: true, provider: 'openai', model: 'gpt-4o' });
    expect(raw.activity).toMatchObject({ enabled: false, retentionDays: 30, maxPhraseChars: 40 });

    // A fresh manager reads the persisted values back.
    const reopened = new SkillManager({ configDir });
    await reopened.init();
    expect(reopened.config.thresholds.overlap).toBe(0.4);
    expect(reopened.config.llm.apiKey).toBe('sk-test');
  });
});

describe('SkillManager project registry', () => {
  it('adds, pins, lists and removes projects', async () => {
    const { manager } = await setup();
    const projectA = await tempDir('skillcat-mgr-proj-a-');
    const projectB = await tempDir('skillcat-mgr-proj-b-');

    await manager.addProject(projectA);
    await manager.addProject(projectB, { pinned: true });

    const listed = await manager.listProjectInfos();
    const a = listed.find((entry) => entry.path === projectA);
    const b = listed.find((entry) => entry.path === projectB);
    expect(a).toMatchObject({ registered: true, pinned: false });
    expect(b).toMatchObject({ registered: true, pinned: true });
    // Pinned projects sort before unpinned ones.
    expect(listed[0]?.path).toBe(projectB);

    await manager.setProjectPinned(projectA, true);
    await manager.removeProject(projectA);

    const after = await manager.listProjectInfos();
    expect(after.some((entry) => entry.path === projectA)).toBe(false);
    expect(after.some((entry) => entry.path === projectB)).toBe(true);
  });
});

describe('SkillManager doctor', () => {
  it('reports the config dir and warns when no roots are configured', async () => {
    const { manager, configDir } = await setup();

    const report = await manager.doctor();

    expect(report.configDir).toBe(configDir);
    expect(Array.isArray(report.lockFiles)).toBe(true);
    expect(report.warnings.map((warning) => warning.code)).toContain('doctor.noRoots');
    expect(report.ok).toBe(false);
  });
});

describe('SkillManager evaluation lifecycle', () => {
  it('runs an evaluation, persists it and flags staleness after a scan change', async () => {
    const { manager, home } = await setup({ caller });
    await manager.setLlm(llm);
    await manager.refresh();

    await manager.runEvaluation('en');

    expect(manager.state.evaluation).not.toBeNull();
    expect(manager.state.verdicts.length).toBeGreaterThan(0);
    expect(manager.state.verdictsAt).not.toBeNull();
    expect(manager.evaluationStale()).toBe(false);
    expect(manager.verdictsStale()).toBe(false);
    // The AI verdict is applied to the rule findings.
    expect(manager.state.findings.some((finding) => finding.ai !== undefined)).toBe(true);

    // Changing a skill on disk invalidates the saved evaluation.
    await writeFile(
      join(home, '.agents', 'skills', 'alpha', 'SKILL.md'),
      skillMd('alpha', 'extra: changed'),
    );
    await manager.refresh();
    expect(manager.evaluationStale()).toBe(true);
  });

  it('records the error and resets state when the model fails', async () => {
    const failing: ModelCaller = async () => {
      throw new Error('boom');
    };
    const { manager } = await setup({ caller: failing });
    await manager.setLlm(llm);
    await manager.refresh();

    await expect(manager.runEvaluation('en')).rejects.toThrow('boom');
    expect(manager.state.evaluationError).toBe('boom');
    expect(manager.state.evaluating).toBe(false);
  });
});
