import { describe, expect, it } from 'vitest';
import { findConflicts } from '../conflicts.js';
import type { AgentLink, Finding, SkillRecord, TriggerTerm } from '../types.js';

function term(text: string, kind: 'positive' | 'negative' = 'positive'): TriggerTerm {
  return { text, norm: text.toLowerCase(), kind, source: 'when_to_use', weight: 1 };
}

function link(partial: Partial<AgentLink>): AgentLink {
  return {
    agentId: 'claude-code',
    display: 'Claude Code',
    dir: '/tmp/.claude/skills',
    path: '/tmp/.claude/skills/demo',
    state: 'symlink-ok',
    ...partial,
  };
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

function rules(findings: Finding[]): string[] {
  return findings.map((finding) => finding.rule);
}

const thresholds = { overlap: 0.2, duplicate: 0.5 };

describe('findConflicts', () => {
  it('flags dangling symlinks', () => {
    const findings = findConflicts({
      records: [record({ name: 'demo', links: [link({ state: 'symlink-dangling' })] })],
      orphans: [],
      lastSeen: {},
      thresholds,
    });
    expect(rules(findings)).toContain('dangling-link');
    expect(findings[0]!.severity).toBe('error');
  });

  it('flags manual skills without lock entries', () => {
    const findings = findConflicts({
      records: [record({ name: 'demo' })],
      orphans: [],
      lastSeen: {},
      thresholds,
    });
    expect(rules(findings)).toContain('dir-missing-lock');
  });

  it('flags orphan lock entries', () => {
    const findings = findConflicts({
      records: [],
      orphans: [
        {
          name: 'ghost',
          scope: 'global',
          entry: { source: 'owner/repo', sourceType: 'github' },
          expectedPath: '/tmp/skills/ghost',
        },
      ],
      lastSeen: {},
      thresholds,
    });
    expect(rules(findings)).toContain('lock-missing-dir');
    expect(findings[0]!.severity).toBe('error');
  });

  it('flags shadowing with same source and source-conflict with different sources', () => {
    const globalRecord = record({
      name: 'shared',
      lock: { source: 'owner/repo', sourceType: 'github' },
    });
    const projectSame = record({
      name: 'shared',
      scope: 'project',
      projectPath: '/tmp/proj',
      lock: { source: 'owner/repo', sourceType: 'github' },
    });
    const projectOther = record({
      name: 'shared',
      scope: 'project',
      projectPath: '/tmp/proj2',
      lock: { source: 'other/repo', sourceType: 'github' },
    });

    const same = findConflicts({
      records: [globalRecord, projectSame],
      orphans: [],
      lastSeen: {},
      thresholds,
    });
    expect(rules(same)).toContain('shadowing');

    const other = findConflicts({
      records: [globalRecord, projectOther],
      orphans: [],
      lastSeen: {},
      thresholds,
    });
    expect(rules(other)).toContain('source-conflict');
  });

  it('flags local content drift when the lock hash is sha256', () => {
    const findings = findConflicts({
      records: [
        record({
          name: 'demo',
          contentHash: 'b'.repeat(64),
          lock: { source: 'local', sourceType: 'local', skillFolderHash: 'c'.repeat(64) },
        }),
      ],
      orphans: [],
      lastSeen: {},
      thresholds,
    });
    expect(rules(findings)).toContain('local-modified');
  });

  it('flags trigger overlap and negative contradiction', () => {
    const a = record({
      name: 'alpha',
      triggers: {
        positive: [term('润色文章'), term('降噪处理')],
        negative: [],
        intents: [],
        hasWhenSignal: true,
      },
    });
    const b = record({
      name: 'beta',
      triggers: {
        positive: [term('润色文章'), term('降噪处理')],
        negative: [term('降噪处理', 'negative')],
        intents: [],
        hasWhenSignal: true,
      },
    });
    const findings = findConflicts({ records: [a, b], orphans: [], lastSeen: {}, thresholds });
    expect(rules(findings)).toContain('trigger-overlap');
    expect(rules(findings)).toContain('negative-contradiction');
    const overlap = findings.find((finding) => finding.rule === 'trigger-overlap')!;
    expect(overlap.confidence).toBe('heuristic');
  });

  it('flags duplicate bodies', () => {
    const body = '这是一段用于测试的正文内容，包含足够的长度来生成 shingles。'.repeat(30);
    const a = record({ name: 'alpha', body });
    const b = record({ name: 'beta', body });
    const findings = findConflicts({ records: [a, b], orphans: [], lastSeen: {}, thresholds });
    expect(rules(findings)).toContain('duplicate-content');
  });

  it('flags missing when-signal as lint', () => {
    const findings = findConflicts({
      records: [
        record({
          name: 'demo',
          description: 'Utilities.',
          triggers: { positive: [term('demo')], negative: [], intents: [], hasWhenSignal: false },
        }),
      ],
      orphans: [],
      lastSeen: {},
      thresholds,
    });
    expect(rules(findings)).toContain('description-lint');
  });
});
