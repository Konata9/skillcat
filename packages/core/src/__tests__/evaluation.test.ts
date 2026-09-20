import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCatalogEntries,
  buildPairs,
  evaluateSkills,
  evaluationSignature,
  extractJson,
  parseModelJson,
  reviewCandidatePairs,
  type ModelCaller,
} from '../evaluation/evaluate.js';
import { applyVerdicts, pairKey } from '../evaluation/verdicts.js';
import { SidecarStore } from '../sidecar.js';
import type {
  AiPairVerdict,
  EvaluationEvent,
  EvaluationStore,
  Finding,
  LlmSettings,
  SkillRecord,
  SkillRef,
  TriggerTerm,
} from '../types.js';

function term(text: string): TriggerTerm {
  return { text, norm: text.toLowerCase(), kind: 'positive', source: 'when_to_use', weight: 1 };
}

function record(partial: Partial<SkillRecord> & { name: string }): SkillRecord {
  return {
    scope: 'global',
    path: `/tmp/skills/${partial.name}`,
    description: 'Use when doing the thing.',
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

const settings: LlmSettings = {
  enabled: true,
  provider: 'openai',
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
};

const pairRecords = [
  record({ name: 'alpha', triggers: { positive: [term('rewrite documents')], negative: [], intents: [], hasWhenSignal: true } }),
  record({ name: 'beta', triggers: { positive: [term('rewrite documents')], negative: [], intents: [], hasWhenSignal: true } }),
];

describe('extractJson', () => {
  it('parses JSON wrapped in prose or code fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":1} — done')).toEqual({ a: 1 });
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('throws on responses without JSON', () => {
    expect(() => extractJson('no json here')).toThrow('no JSON');
  });
});

describe('parseModelJson', () => {
  it('parses complete and fenced JSON', async () => {
    expect(await parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('repairs a truncated JSON array instead of failing', async () => {
    const truncated =
      '{"scores":[{"id":"s1","score":80,"summary":"ok"},{"id":"s2","score":40,"summary":"cut';
    const value = (await parseModelJson(truncated)) as {
      scores: Array<{ id: string; score?: number }>;
    };
    expect(value.scores[0]).toMatchObject({ id: 's1', score: 80 });
    expect(value.scores.at(-1)?.id).toBe('s2');
  });

  it('repairs the loose JSON that OpenAI-compatible models emit', async () => {
    const expected = { scores: [{ id: 's1', score: 80 }] };
    expect(await parseModelJson('{scores:[{id:"s1",score:80}]}')).toEqual(expected);
    expect(await parseModelJson("{'scores':[{'id':'s1','score':80}]}")).toEqual(expected);
    expect(
      await parseModelJson('{\u201cscores\u201d:[{\u201cid\u201d:\u201cs1\u201d,\u201cscore\u201d:80}]}'),
    ).toEqual(expected);
    expect(await parseModelJson('{"scores":[{"id":"s1","score":80},]}')).toEqual(expected);
  });

  it('fails with a diagnosable snippet when nothing can be parsed', async () => {
    await expect(parseModelJson('I cannot evaluate these skills.')).rejects.toThrow(/no JSON/);
  });
});

describe('buildPairs', () => {
  it('surfaces trigger-overlap candidates with ids', () => {
    const catalog = buildCatalogEntries(pairRecords);
    const pairs = buildPairs(pairRecords, catalog);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ a: 's1', b: 's2' });
    expect(pairs[0]?.reason).toContain('trigger overlap');
  });
});

describe('evaluationSignature', () => {
  it('changes when skill content changes', () => {
    const a = [record({ name: 'alpha', contentHash: 'a'.repeat(64) })];
    const b = [record({ name: 'alpha', contentHash: 'b'.repeat(64) })];
    expect(evaluationSignature(a, settings)).not.toBe(evaluationSignature(b, settings));
  });
});

describe('evaluation persistence', () => {
  it('round-trips the store through the sidecar', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillcat-eval-'));
    const store = new SidecarStore(dir);
    expect(await store.loadEvaluation()).toBeNull();

    const saved: EvaluationStore = {
      report: {
        generatedAt: '2026-01-01T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-4o',
        locale: 'en',
        signature: 'sig',
        summary: 'ok',
        averageScore: 50,
        scores: [],
      },
      verdicts: [],
      verdictsAt: '2026-01-01T00:00:00.000Z',
      verdictsSignature: 'sig',
    };
    await store.saveEvaluation(saved);
    expect(await store.loadEvaluation()).toEqual(saved);
  });

  it('migrates a legacy bare report into a store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillcat-eval-'));
    const store = new SidecarStore(dir);
    await writeFile(
      join(dir, 'evaluation.json'),
      JSON.stringify({
        generatedAt: '2026-01-01T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-4o',
        locale: 'en',
        signature: 'sig',
        summary: 'ok',
        averageScore: 50,
        scores: [],
        issues: [
          {
            id: 'ai-1',
            kind: 'duplicate',
            severity: 'warn',
            skills: [
              { name: 'alpha', scope: 'global', path: '/a' },
              { name: 'beta', scope: 'global', path: '/b' },
            ],
            title: 'Dup',
            detail: 'Same.',
            suggestion: 'Merge.',
          },
        ],
      }),
    );

    const loaded = await store.loadEvaluation();
    expect(loaded?.report?.summary).toBe('ok');
    expect(loaded?.verdicts).toHaveLength(1);
    expect(loaded?.verdicts[0]).toMatchObject({
      kind: 'duplicate',
      verdict: 'confirmed',
      title: 'Dup',
    });
  });
});

describe('applyVerdicts', () => {
  const alphaBeta: [SkillRef, SkillRef] = [
    { name: 'alpha', scope: 'global', path: '/a' },
    { name: 'beta', scope: 'global', path: '/b' },
  ];
  const gammaDelta: [SkillRef, SkillRef] = [
    { name: 'gamma', scope: 'global', path: '/g' },
    { name: 'delta', scope: 'global', path: '/d' },
  ];

  const base: Finding[] = [
    {
      id: 'trigger-overlap:global||alpha:global||beta',
      rule: 'trigger-overlap',
      severity: 'info',
      confidence: 'heuristic',
      title: { code: 'finding.triggerOverlap.title', params: { a: 'alpha', b: 'beta' } },
      detail: {
        code: 'finding.triggerOverlap.detail',
        params: { score: 40, cosine: 50, jaccard: 30, shared: ['x'] },
      },
      skills: alphaBeta,
      evidence: ['x'],
    },
  ];

  function verdict(skills: [SkillRef, SkillRef], overrides: Partial<AiPairVerdict> = {}): AiPairVerdict {
    return {
      pairKey: pairKey(skills)!,
      skills,
      kind: 'duplicate',
      verdict: 'confirmed',
      severity: 'warn',
      title: 'Duplicated',
      detail: 'Same purpose.',
      suggestion: 'Merge them.',
      ...overrides,
    };
  }

  it('annotates a matching heuristic finding without changing its severity', () => {
    const result = applyVerdicts(base, [
      verdict(alphaBeta, { verdict: 'false-positive', detail: 'Not really.' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.ai).toMatchObject({ verdict: 'false-positive', detail: 'Not really.' });
    expect(result[0]?.severity).toBe('info');
  });

  it('adds an AI finding for a confirmed pair with no heuristic match', () => {
    const result = applyVerdicts(base, [verdict(gammaDelta)]);
    expect(result.some((finding) => finding.rule === 'ai-duplicate' && finding.confidence === 'ai')).toBe(
      true,
    );
    expect(result.find((finding) => finding.rule === 'trigger-overlap')?.ai).toBeUndefined();
  });

  it('ignores false positives that have no heuristic match', () => {
    const result = applyVerdicts(base, [verdict(gammaDelta, { verdict: 'false-positive' })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.rule).toBe('trigger-overlap');
  });
});

describe('reviewCandidatePairs', () => {
  it('returns one verdict per candidate pair', async () => {
    const caller: ModelCaller = async () => ({
      verdicts: [
        {
          a: 's1',
          b: 's2',
          kind: 'duplicate',
          verdict: 'confirmed',
          severity: 'warn',
          title: 'Dup',
          detail: 'Same.',
          suggestion: 'Merge.',
        },
      ],
    });
    const verdicts = await reviewCandidatePairs({
      records: pairRecords,
      settings,
      locale: 'en',
      caller,
    });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ kind: 'duplicate', verdict: 'confirmed', title: 'Dup' });
    expect(verdicts[0]?.skills.map((skill) => skill.name)).toEqual(['alpha', 'beta']);
  });

  it('rewrites catalog ids in prose to skill names', async () => {
    const caller: ModelCaller = async () => ({
      verdicts: [
        {
          a: 's1',
          b: 's2',
          kind: 'duplicate',
          verdict: 'confirmed',
          severity: 'warn',
          title: 's1 与 s2 重复',
          detail: '在 s1 中声明，s2 已覆盖。',
          suggestion: '合并 s2。',
        },
      ],
    });
    const verdicts = await reviewCandidatePairs({
      records: pairRecords,
      settings,
      locale: 'zh',
      caller,
    });
    expect(verdicts[0]?.title).toBe('alpha 与 beta 重复');
    expect(verdicts[0]?.detail).toBe('在 alpha 中声明，beta 已覆盖。');
    expect(verdicts[0]?.suggestion).toBe('合并 beta。');
  });
});

describe('evaluateSkills', () => {
  const caller: ModelCaller = async ({ prompt }) => {
    if (prompt.startsWith('Score each')) {
      return {
        scores: [
          { id: 's1', score: 80, grade: 'B', summary: 'Solid.', strengths: ['clear'], issues: [] },
          { id: 's2', score: 40, summary: 'Vague.', strengths: [], issues: ['missing boundaries'] },
        ],
      };
    }
    if (prompt.startsWith('Judge the following')) {
      return {
        verdicts: [
          {
            a: 's1',
            b: 's2',
            kind: 'duplicate',
            verdict: 'confirmed',
            severity: 'warn',
            title: 'Duplicated',
            detail: 'Same purpose.',
            suggestion: 'Merge them.',
          },
        ],
      };
    }
    return { summary: 'Overall summary.' };
  };

  it('assembles scores, verdicts, summary and progress', async () => {
    const progress: Array<{ done: number; total: number }> = [];
    const { report, verdicts } = await evaluateSkills({
      records: pairRecords,
      settings,
      locale: 'en',
      caller,
      onProgress: (value) => progress.push(value),
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(report.provider).toBe('openai');
    expect(report.model).toBe('gpt-4o');
    expect(report.locale).toBe('en');
    expect(report.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(report.signature).toBe(evaluationSignature(pairRecords, settings));
    expect(report.summary).toBe('Overall summary.');
    expect(report.averageScore).toBe(60);
    expect(report.scores.map((entry) => [entry.skill.name, entry.score, entry.grade])).toEqual([
      ['beta', 40, 'D'],
      ['alpha', 80, 'B'],
    ]);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({
      kind: 'duplicate',
      verdict: 'confirmed',
      severity: 'warn',
      title: 'Duplicated',
      suggestion: 'Merge them.',
    });
    expect(verdicts[0]?.skills.map((skill) => skill.name)).toEqual(['alpha', 'beta']);

    expect(progress.at(-1)).toEqual({ done: 3, total: 3 });
  });

  it('skips malformed score entries instead of failing the batch', async () => {
    const partialCaller: ModelCaller = async ({ prompt }) => {
      if (prompt.startsWith('Score each')) {
        return { scores: [{ id: 's1', score: 80 }, { id: 's2' }] };
      }
      if (prompt.startsWith('Judge')) return { verdicts: [] };
      return { summary: 'ok' };
    };
    const { report } = await evaluateSkills({
      records: pairRecords,
      settings,
      locale: 'en',
      caller: partialCaller,
    });
    expect(report.scores.map((entry) => entry.skill.name)).toEqual(['alpha']);
  });

  it('retries a failed call once with a stricter instruction', async () => {
    let scoringCalls = 0;
    const flaky: ModelCaller = async ({ prompt }) => {
      if (prompt.startsWith('Score each')) {
        scoringCalls += 1;
        if (scoringCalls === 1) throw new Error('model response was not valid JSON');
        return { scores: [{ id: 's1', score: 70 }, { id: 's2', score: 70 }] };
      }
      if (prompt.startsWith('Judge')) return { verdicts: [] };
      return { summary: 'ok' };
    };
    const { report } = await evaluateSkills({
      records: pairRecords,
      settings,
      locale: 'en',
      caller: flaky,
    });
    expect(scoringCalls).toBe(2);
    expect(report.scores).toHaveLength(2);
  });

  it('keeps scores when the pair judgement fails', async () => {
    const flaky: ModelCaller = async ({ prompt }) => {
      if (prompt.startsWith('Score each')) return { scores: [{ id: 's1', score: 70 }] };
      if (prompt.startsWith('Judge')) throw new Error('pair call failed');
      return { summary: 'ok' };
    };
    const { report, verdicts } = await evaluateSkills({
      records: pairRecords,
      settings,
      locale: 'en',
      caller: flaky,
    });
    expect(report.scores).toHaveLength(1);
    expect(verdicts).toEqual([]);
    expect(report.summary).toBe('ok');
  });

  it('rewrites catalog ids in score prose to skill names', async () => {
    const idCaller: ModelCaller = async ({ prompt }) => {
      if (prompt.startsWith('Score each')) {
        return {
          scores: [
            { id: 's1', score: 70, summary: 's1 描述清晰', strengths: ['s1 边界明确'], issues: ['s1 与 s2 重叠'] },
            { id: 's2', score: 70 },
          ],
        };
      }
      if (prompt.startsWith('Judge')) return { verdicts: [] };
      return { summary: 's1 与 s2 都还行。' };
    };
    const { report } = await evaluateSkills({
      records: pairRecords,
      settings,
      locale: 'zh',
      caller: idCaller,
    });
    const alpha = report.scores.find((entry) => entry.skill.name === 'alpha');
    expect(alpha?.summary).toBe('alpha 描述清晰');
    expect(alpha?.strengths).toEqual(['alpha 边界明确']);
    expect(alpha?.issues).toEqual(['alpha 与 beta 重叠']);
    expect(report.summary).toBe('alpha 与 beta 都还行。');
  });

  it('streams process steps and reasoning events', async () => {
    const events: EvaluationEvent[] = [];
    const streamingCaller: ModelCaller = async ({ prompt, onReasoning }) => {
      onReasoning?.('weighing the criteria');
      if (prompt.startsWith('Score each')) {
        return { scores: [{ id: 's1', score: 70 }, { id: 's2', score: 70 }] };
      }
      if (prompt.startsWith('Judge')) return { verdicts: [] };
      return { summary: 'ok' };
    };
    await evaluateSkills({
      records: pairRecords,
      settings,
      locale: 'en',
      caller: streamingCaller,
      onEvent: (event) => events.push(event),
    });

    expect(events[0]?.type).toBe('start');
    const codes = events
      .filter((event) => event.type === 'step')
      .map((event) => event.step?.code);
    expect(codes).toContain('eval.step.prepare');
    expect(codes).toContain('eval.step.scoring');
    expect(codes).toContain('eval.step.pairs');
    expect(codes).toContain('eval.step.judging');
    expect(codes).toContain('eval.step.summary');
    expect(events.some((event) => event.type === 'reasoning' && event.text)).toBe(true);
  });

  it('rejects an empty skill set', async () => {
    await expect(
      evaluateSkills({ records: [], settings, locale: 'en', caller }),
    ).rejects.toThrow('no skills');
  });
});
