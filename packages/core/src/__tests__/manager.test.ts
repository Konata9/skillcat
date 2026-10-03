import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelCaller } from '../evaluation/evaluate.js';
import { recordKey } from '../keys.js';
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

describe('SkillManager built-in skills', () => {
  it('scans app-shipped skills with a dedicated identity and no lock/links', async () => {
    const home = await tempDir('skillcat-mgr-builtin-home-');
    const configDir = await tempDir('skillcat-mgr-builtin-config-');
    const builtinDir = await tempDir('skillcat-mgr-builtin-');
    await mkdir(join(builtinDir, 'skill-optimizer'), { recursive: true });
    await writeFile(
      join(builtinDir, 'skill-optimizer', 'SKILL.md'),
      ['---', 'name: skill-optimizer', 'description: Optimize a skill', '---', '# Optimizer'].join(
        '\n',
      ),
    );

    process.env.HOME = home;
    process.env.SKILLCAT_CONFIG_DIR = configDir;
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ version: 1, skillsCommand: ['true'] }),
    );

    const manager = new SkillManager({ configDir, builtinSkillsDir: builtinDir });
    await manager.init();
    // Built-in skills follow the same visibility toggle as user-internal ones.
    await manager.setShowInternal(true);
    await manager.refresh();

    const record = manager.allRecords().find((entry) => entry.name === 'skill-optimizer');
    expect(record?.builtin).toBe(true);
    expect(record?.lock).toBeNull();
    expect(record?.links).toEqual([]);
    expect(recordKey(record!)).toBe('builtin||skill-optimizer');
    // Built-in skills never produce user-facing health findings.
    expect(manager.state.findings.some((finding) => finding.rule === 'dir-missing-lock')).toBe(
      false,
    );
    expect(manager.state.findings.some((finding) => finding.rule === 'description-lint')).toBe(
      false,
    );
  });
});

describe('SkillManager optimization', () => {
  it('refuses to optimize without a configured model', async () => {
    const { manager } = await setup();
    const record = manager.allRecords()[0]!;
    await expect(manager.optimizeSkill(record, 'en')).rejects.toThrow('LLM is not configured');
  });

  it('stores read-only suggestions and clears the in-flight marker', async () => {
    const optimizeCaller: ModelCaller = async () => ({
      summary: 'Looks solid.',
      suggestions: [{ title: 'Narrow triggers', severity: 'low' }],
    });
    const { manager } = await setup({ caller: optimizeCaller });
    await manager.setLlm(llm);
    await manager.refresh();

    const record = manager.allRecords().find((entry) => entry.name === 'alpha')!;
    const result = await manager.optimizeSkill(record, 'en');

    expect(result.suggestions).toHaveLength(1);
    expect(manager.optimizationFor(record)?.summary).toBe('Looks solid.');
    expect(manager.state.optimizing).toBeNull();
    expect(manager.optimizationStale(record)).toBe(false);
  });

  it('keeps the last result (flagged stale) when the skill changes on disk', async () => {
    const optimizeCaller: ModelCaller = async () => ({
      summary: 's',
      suggestions: [{ title: 't', severity: 'low' }],
    });
    const { manager, home } = await setup({ caller: optimizeCaller });
    await manager.setLlm(llm);
    await manager.refresh();

    const record = manager.allRecords().find((entry) => entry.name === 'alpha')!;
    await manager.optimizeSkill(record, 'en');

    await writeFile(
      join(home, '.agents', 'skills', 'alpha', 'SKILL.md'),
      skillMd('alpha', 'extra: changed'),
    );
    await manager.refresh();

    const updated = manager.allRecords().find((entry) => entry.name === 'alpha')!;
    // Retained (no token re-spend); flagged stale so the UI can hint.
    expect(manager.optimizationFor(updated)?.summary).toBe('s');
    expect(manager.optimizationStale(updated)).toBe(true);
  });

  it('persists results across a restart', async () => {
    const optimizeCaller: ModelCaller = async () => ({
      summary: 'kept',
      suggestions: [{ title: 't', severity: 'low' }],
    });
    const { manager, configDir } = await setup({ caller: optimizeCaller });
    await manager.setLlm(llm);
    await manager.refresh();
    const record = manager.allRecords().find((entry) => entry.name === 'alpha')!;
    await manager.optimizeSkill(record, 'en');

    // A fresh manager reads the saved result back without re-running the model.
    const reopened = new SkillManager({ configDir, modelCaller: optimizeCaller });
    await reopened.init();
    await reopened.refresh();
    const again = reopened.allRecords().find((entry) => entry.name === 'alpha')!;
    expect(reopened.optimizationFor(again)?.summary).toBe('kept');
  });

  it('uses the shipped rubric even when built-in skills are hidden', async () => {
    const home = await tempDir('skillcat-mgr-rubric-home-');
    const configDir = await tempDir('skillcat-mgr-rubric-config-');
    const builtinDir = await tempDir('skillcat-mgr-rubric-builtin-');
    await mkdir(join(home, '.agents', 'skills', 'alpha'), { recursive: true });
    await writeFile(join(home, '.agents', 'skills', 'alpha', 'SKILL.md'), skillMd('alpha'));
    await mkdir(join(builtinDir, 'skill-optimizer'), { recursive: true });
    await writeFile(
      join(builtinDir, 'skill-optimizer', 'SKILL.md'),
      ['---', 'name: skill-optimizer', 'description: Optimize', '---', 'RUBRIC-BODY-MARKER'].join('\n'),
    );

    process.env.HOME = home;
    process.env.SKILLCAT_CONFIG_DIR = configDir;
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({ version: 1, skillsCommand: ['true'] }),
    );

    let system = '';
    const caller: ModelCaller = async (request) => {
      system = request.system;
      return { summary: '', suggestions: [] };
    };
    const manager = new SkillManager({ configDir, builtinSkillsDir: builtinDir, modelCaller: caller });
    await manager.init();
    await manager.setLlm(llm);
    await manager.refresh();

    // showInternal defaults to false: the built-in skill is not in the catalog...
    expect(manager.allRecords().some((entry) => entry.builtin)).toBe(false);

    // ...yet its rubric is still injected into the optimize prompt.
    const record = manager.allRecords().find((entry) => entry.name === 'alpha')!;
    await manager.optimizeSkill(record, 'en');
    expect(system).toContain('RUBRIC-BODY-MARKER');
  });
});
