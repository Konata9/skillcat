/**
 * Per-record and record-aggregate rules: link state, lock hash drift and
 * description lint. Each rule is pure over the shared `AnalysisContext`.
 */
import { getAgentById } from '../agents.js';
import { recordKey } from '../keys.js';
import type { Finding, SkillRecord } from '../types.js';
import { isSha256, message, ref, type AnalysisRule } from './helpers.js';

/**
 * Collapses an agent id or display name to a comparable key so `claude-code`
 * and `Claude Code` (or the CLI's variants) match.
 */
function normalizeAgentKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** A declared agent symlink points at a target that no longer exists. */
export const danglingLinkRule: AnalysisRule = ({ records }) => {
  const findings: Finding[] = [];
  for (const record of records) {
    const key = recordKey(record);
    for (const link of record.links) {
      if (link.state !== 'symlink-dangling') continue;
      findings.push({
        id: `dangling-link:${key}:${link.agentId}`,
        rule: 'dangling-link',
        severity: 'error',
        confidence: 'deterministic',
        title: message('finding.danglingLink.title', { name: record.name, agent: link.display }),
        detail: message('finding.danglingLink.detail', {
          path: link.path,
          target: link.target ?? '?',
        }),
        suggestion: message('finding.danglingLink.suggestion', {
          command: `npx skills remove ${record.name}${record.scope === 'global' ? ' -g' : ''}`,
        }),
        skills: [ref(record)],
        evidence: [link.path],
      });
    }
  }
  return findings;
};

/** A skill directory exists on disk but the lock file has no entry for it. */
export const dirMissingLockRule: AnalysisRule = ({ records }) => {
  const findings: Finding[] = [];
  for (const record of records) {
    if (record.lock !== null) continue;
    const key = recordKey(record);
    findings.push({
      id: `dir-missing-lock:${key}`,
      rule: 'dir-missing-lock',
      severity: 'info',
      confidence: 'deterministic',
      title: message('finding.dirMissingLock.title', { name: record.name }),
      detail: message('finding.dirMissingLock.detail'),
      suggestion: message('finding.dirMissingLock.suggestion'),
      skills: [ref(record)],
      evidence: [record.path],
    });
  }
  return findings;
};

/** An agent link is a copy whose hash no longer matches the canonical skill. */
export const copyDriftRule: AnalysisRule = ({ records }) => {
  const findings: Finding[] = [];
  for (const record of records) {
    if (!record.lock) continue;
    const key = recordKey(record);
    for (const link of record.links) {
      if (link.state !== 'copy' || !link.copyHash || link.copyHash === record.contentHash) continue;
      findings.push({
        id: `copy-drift:${key}:${link.agentId}`,
        rule: 'copy-drift',
        severity: 'warn',
        confidence: 'deterministic',
        title: message('finding.copyDrift.title', { name: record.name, agent: link.display }),
        detail: message('finding.copyDrift.detail'),
        suggestion: message('finding.copyDrift.suggestion'),
        skills: [ref(record)],
        evidence: [link.path],
      });
    }
  }
  return findings;
};

/**
 * The skill content differs from the lock hash (or from the previous scan when
 * the lock carries no usable hash).
 */
export const localModifiedRule: AnalysisRule = ({ records, lastSeen }) => {
  const findings: Finding[] = [];
  for (const record of records) {
    if (!record.lock) continue;
    const key = recordKey(record);
    const lockHash = record.lock.skillFolderHash;
    if (isSha256(lockHash)) {
      if (lockHash !== record.contentHash) {
        findings.push({
          id: `local-modified:${key}`,
          rule: 'local-modified',
          severity: 'warn',
          confidence: 'deterministic',
          title: message('finding.localModifiedHash.title', { name: record.name }),
          detail: message('finding.localModifiedHash.detail'),
          suggestion: message('finding.localModifiedHash.suggestion'),
          skills: [ref(record)],
          evidence: [
            `lock=${lockHash.slice(0, 12)}…`,
            `local=${record.contentHash.slice(0, 12)}…`,
          ],
        });
      }
      continue;
    }
    const previous = lastSeen[key];
    if (previous && previous !== record.contentHash) {
      findings.push({
        id: `local-modified:${key}`,
        rule: 'local-modified',
        severity: 'info',
        confidence: 'deterministic',
        title: message('finding.localModifiedScan.title', { name: record.name }),
        detail: message('finding.localModifiedScan.detail'),
        suggestion: message('finding.localModifiedScan.suggestion'),
        skills: [ref(record)],
        evidence: [
          `previous=${previous.slice(0, 12)}…`,
          `local=${record.contentHash.slice(0, 12)}…`,
        ],
      });
    }
  }
  return findings;
};

/**
 * A skill declares an agent association but the link is missing. Grouped per
 * agent + scope + project so one finding lists every affected skill.
 */
export const declaredLinkMissingRule: AnalysisRule = ({ records }) => {
  const declaredMissing = new Map<
    string,
    {
      agentId: string;
      display: string;
      scope: SkillRecord['scope'];
      projectPath?: string;
      records: SkillRecord[];
    }
  >();
  for (const record of records) {
    if (!record.lock) continue;
    for (const link of record.links) {
      if (link.state !== 'missing') continue;
      const targets = new Set([normalizeAgentKey(link.agentId), normalizeAgentKey(link.display)]);
      const declared = record.agentsDeclared.some((item) => targets.has(normalizeAgentKey(item)));
      if (!declared) continue;
      const groupKey = `${link.agentId}|${record.scope}|${record.projectPath ?? ''}`;
      const entry = declaredMissing.get(groupKey) ?? {
        agentId: link.agentId,
        display: link.display,
        scope: record.scope,
        projectPath: record.projectPath,
        records: [] as SkillRecord[],
      };
      entry.records.push(record);
      declaredMissing.set(groupKey, entry);
    }
  }

  const findings: Finding[] = [];
  for (const [groupKey, group] of declaredMissing) {
    const agent = getAgentById(group.agentId);
    findings.push({
      id: `declared-link-missing:${groupKey}`,
      rule: 'declared-link-missing',
      severity: 'info',
      confidence: 'deterministic',
      title: message('finding.declaredLinkMissing.title', {
        agent: group.display,
        count: group.records.length,
      }),
      detail: message('finding.declaredLinkMissing.detail', { agent: group.display }),
      suggestion: agent
        ? message('finding.declaredLinkMissing.suggestion', { agentId: agent.id })
        : message('finding.declaredLinkMissing.suggestionNoAgent'),
      skills: group.records.slice(0, 8).map(ref),
      evidence: [
        ...group.records.slice(0, 8).map((record) => record.name),
        ...(group.records.length > 8 ? [`+${group.records.length - 8} more`] : []),
      ],
    });
  }
  return findings;
};

/** Description is missing, too short, or carries no "when to use" signal. */
export const descriptionLintRule: AnalysisRule = ({ records }) => {
  const findings: Finding[] = [];
  for (const record of records) {
    const lint = [];
    if (!record.description) lint.push(message('finding.descriptionLint.missingDescription'));
    else if (record.description.length < 20) {
      lint.push(message('finding.descriptionLint.shortDescription'));
    }
    if (!record.triggers.hasWhenSignal) {
      lint.push(message('finding.descriptionLint.noWhenSignal'));
    }
    if (lint.length === 0) continue;
    const key = recordKey(record);
    findings.push({
      id: `description-lint:${key}`,
      rule: 'description-lint',
      severity: 'info',
      confidence: 'deterministic',
      title: message('finding.descriptionLint.title', { name: record.name }),
      detail: message('finding.descriptionLint.detail', { reasons: lint }),
      suggestion: message('finding.descriptionLint.suggestion'),
      skills: [ref(record)],
      evidence: [record.path],
    });
  }
  return findings;
};
