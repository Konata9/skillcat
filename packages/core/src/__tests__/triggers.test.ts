import { describe, expect, it } from 'vitest';
import { applyAnnotation, extractTriggers, normalizeTerm, splitList } from '../triggers.js';

describe('normalizeTerm', () => {
  it('strips quotes, punctuation and lowercases latin', () => {
    expect(normalizeTerm('  "Polish"  ')).toBe('polish');
    expect(normalizeTerm('「润色」。')).toBe('润色');
    expect(normalizeTerm('Use   When:')).toBe('use when');
  });
});

describe('splitList', () => {
  it('splits on chinese and latin separators', () => {
    expect(splitList('润色、降噪，polish')).toEqual(['润色', '降噪', 'polish']);
    expect(splitList('code review or debugging')).toEqual(['code review', 'debugging']);
  });

  it('strips lead noise phrases', () => {
    expect(splitList('当用户要求润色文章')).toEqual(['润色文章']);
  });
});

describe('extractTriggers', () => {
  it('extracts structured when_to_use and dispatch_intent', () => {
    const profile = extractTriggers({
      name: 'config-audit',
      description:
        'Runs a budget-aware audit. Use when users ask to audit config or check drift. Not for debugging application code.',
      frontmatter: {
        when_to_use: '检查配置, 检查漂移, AGENTS.md, 健康度, 配置检查',
        dispatch_intent: 'config audit, hooks/MCP broken',
      },
      body: '',
    });

    const positives = profile.positive.map((term) => term.text);
    expect(positives).toContain('检查配置');
    expect(positives).toContain('AGENTS.md');
    expect(profile.intents).toContain('config audit');

    const negatives = profile.negative.map((term) => term.text);
    expect(negatives.join('|')).toContain('debugging application code');
    expect(profile.hasWhenSignal).toBe(true);

    const structured = profile.positive.find((term) => term.text === '健康度');
    expect(structured?.source).toBe('when_to_use');
    expect(structured?.weight).toBe(1);
  });

  it('extracts quoted chinese trigger words from description', () => {
    const profile = extractTriggers({
      name: 'text-polish',
      description:
        '一个文本润色工具。当用户要求润色文章、去 AI 味、降噪处理、或提到"润色""去AI味""降噪""优化文章""polish"时触发。',
      frontmatter: {},
      body: '',
    });
    const positives = profile.positive.map((term) => term.text.toLowerCase());
    expect(positives).toContain('润色');
    expect(positives).toContain('去ai味');
    expect(positives).toContain('polish');
    expect(positives.some((text) => text.includes('降噪'))).toBe(true);
    expect(profile.hasWhenSignal).toBe(true);
  });

  it('extracts trigger sections from the body', () => {
    const profile = extractTriggers({
      name: 'demo',
      description: 'A demo skill',
      frontmatter: {},
      body: ['# Demo', '', '## When to Use', '', '- 写周报', '- generate release notes', '', '## Steps', '1. do it'].join('\n'),
    });
    const positives = profile.positive.map((term) => term.text);
    expect(positives).toContain('写周报');
    expect(positives).toContain('generate release notes');
    expect(positives).not.toContain('do it');
  });

  it('does not flag when-signal for name-only matches', () => {
    const profile = extractTriggers({
      name: 'pdf-tools',
      description: 'Utilities for documents.',
      frontmatter: {},
      body: '# PDF tools\nSome content.',
    });
    expect(profile.positive.length).toBeGreaterThan(0);
    expect(profile.hasWhenSignal).toBe(false);
  });
});

describe('applyAnnotation', () => {
  it('adds and removes user terms', () => {
    const profile = extractTriggers({
      name: 'demo',
      description: 'Use when writing reports',
      frontmatter: {},
      body: '',
    });
    const updated = applyAnnotation(profile, {
      added: [{ text: '周报', kind: 'positive' }],
      removed: ['writing reports'],
    });
    const positives = updated.positive.map((term) => term.text);
    expect(positives).toContain('周报');
    expect(positives).not.toContain('writing reports');
    const userTerm = updated.positive.find((term) => term.text === '周报');
    expect(userTerm?.user).toBe(true);
  });
});
