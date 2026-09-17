import { describe, expect, it } from 'vitest';
import { bodySimilarity, computeOverlaps, jaccard, tokenize } from '../similarity.js';
import type { SkillRecord, TriggerTerm } from '../types.js';

function term(text: string, kind: 'positive' | 'negative' = 'positive'): TriggerTerm {
  return {
    text,
    norm: text.toLowerCase(),
    kind,
    source: 'when_to_use',
    weight: 1,
  };
}

function record(name: string, terms: string[], body = ''): SkillRecord {
  return {
    name,
    scope: 'global',
    path: `/tmp/${name}`,
    description: '',
    frontmatter: {},
    body,
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
    triggers: { positive: terms.map((t) => term(t)), negative: [], intents: [], hasWhenSignal: true },
    internal: false,
    installedAt: null,
    updatedAt: null,
    mtimeMs: 0,
  };
}

describe('tokenize', () => {
  it('keeps meaningful chinese words and latin tokens', () => {
    const tokens = tokenize('当用户要求润色文章，使用 polish 功能');
    expect(tokens).toContain('润色');
    expect(tokens).toContain('polish');
    expect(tokens).not.toContain('的');
  });
});

describe('computeOverlaps', () => {
  it('finds overlapping trigger terms', () => {
    const a = record('humanize-plus', ['润色文章', '去AI味', '降噪处理']);
    const b = record('humanizer-zh', ['润色文章', '去AI味', 'AI写作痕迹']);
    const c = record('pdf-tools', ['合并PDF', '拆分PDF', '加水印']);

    const pairs = computeOverlaps([a, b, c], 0.2);
    expect(pairs.length).toBe(1);
    expect([pairs[0]!.aName, pairs[0]!.bName].sort()).toEqual(['humanize-plus', 'humanizer-zh']);
    expect(pairs[0]!.shared.length).toBeGreaterThan(0);
  });

  it('returns nothing for disjoint skills', () => {
    const a = record('alpha', ['合并PDF', '拆分PDF']);
    const b = record('beta', ['写周报', '生成月报']);
    expect(computeOverlaps([a, b], 0.2)).toHaveLength(0);
  });
});

describe('bodySimilarity', () => {
  it('scores identical bodies as 1', () => {
    const text = '这是一段用于测试的正文内容，包含足够的长度。'.repeat(20);
    expect(bodySimilarity(text, text)).toBeCloseTo(1, 5);
  });

  it('scores unrelated bodies low', () => {
    const a = '这是一个关于 PDF 处理工具的技能说明，支持合并与拆分。'.repeat(20);
    const b = '这是一个关于周报写作的技能说明，帮助整理本周工作。'.repeat(20);
    expect(bodySimilarity(a, b)).toBeLessThan(0.3);
  });
});

describe('jaccard', () => {
  it('computes set overlap', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3, 5);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });
});
