import { describe, expect, it } from 'vitest';
import type { ModelCaller } from '../evaluation/evaluate.js';
import { optimizationSignature, optimizeSkill } from '../evaluation/optimize.js';
import type { LlmSettings, SkillRecord } from '../types.js';

function record(partial: Partial<SkillRecord> & { name: string }): SkillRecord {
  return {
    scope: 'global',
    path: `/tmp/skills/${partial.name}`,
    description: 'Use when doing the thing.',
    frontmatter: {},
    body: '# body',
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

describe('optimizeSkill', () => {
  it('parses suggestions, coerces severity and injects the built-in rubric', async () => {
    let capturedSystem = '';
    const caller: ModelCaller = async (request) => {
      capturedSystem = request.system;
      return {
        summary: 'Tighten the trigger.',
        suggestions: [
          {
            title: 'Narrow the description',
            severity: 'high',
            rationale: 'Too broad.',
            before: 'Use when docs',
            after: 'Use when editing PDFs',
          },
          { title: 'Drop filler', severity: 'nonsense', rationale: '' },
        ],
      };
    };

    const target = record({ name: 'pdf' });
    const result = await optimizeSkill({
      record: target,
      settings,
      locale: 'en',
      rubric: 'RUBRIC-MARKER',
      caller,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(capturedSystem).toContain('RUBRIC-MARKER');
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0]).toMatchObject({
      title: 'Narrow the description',
      severity: 'high',
      before: 'Use when docs',
      after: 'Use when editing PDFs',
    });
    // Unknown severities fall back to medium.
    expect(result.suggestions[1]!.severity).toBe('medium');
    expect(result.summary).toBe('Tighten the trigger.');
    expect(result.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.signature).toBe(optimizationSignature(target, settings));
  });

  it('returns an empty result when the model output is unusable', async () => {
    const caller: ModelCaller = async () => ({});
    const result = await optimizeSkill({
      record: record({ name: 'x' }),
      settings,
      locale: 'en',
      caller,
    });
    expect(result.suggestions).toEqual([]);
    expect(result.summary).toBe('');
  });
});
