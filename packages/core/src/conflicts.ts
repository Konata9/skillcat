/**
 * Deterministic and heuristic conflict detection over scanned skill records.
 *
 * Deterministic rules cover disk reality (dangling links, lock drift, copy
 * drift, shadowing); heuristic rules cover trigger overlap and body duplication
 * and always carry a confidence + evidence so the UI can show why they fired.
 */
import { getAgentById } from './agents.js';
import { recordKey } from './keys.js';
import { bodyShingles, computeOverlaps, jaccard } from './similarity.js';
import type {
  Finding,
  FindingMessage,
  OrphanLock,
  SkillRecord,
  SkillRef,
  Thresholds,
} from './types.js';

export interface ConflictInput {
  records: SkillRecord[];
  orphans: OrphanLock[];
  lastSeen: Record<string, string>;
  thresholds: Thresholds;
}

function ref(record: SkillRecord): SkillRef {
  return {
    name: record.name,
    scope: record.scope,
    projectPath: record.projectPath,
    path: record.path,
  };
}

function isSha256(value: string | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

function message(code: FindingMessage['code'], params?: FindingMessage['params']): FindingMessage {
  return params ? { code, params } : { code };
}

export function findConflicts(input: ConflictInput): Finding[] {
  const findings: Finding[] = [];
  const { records, orphans, lastSeen, thresholds } = input;
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
    const key = recordKey(record);

    const dangling = record.links.filter((link) => link.state === 'symlink-dangling');
    for (const link of dangling) {
      findings.push({
        id: `dangling-link:${key}:${link.agentId}`,
        rule: 'dangling-link',
        severity: 'error',
        confidence: 'deterministic',
        title: message('finding.danglingLink.title', {
          name: record.name,
          agent: link.display,
        }),
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

    if (record.lock === null) {
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

    if (record.lock) {
      const copyLinks = record.links.filter(
        (link) => link.state === 'copy' && link.copyHash && link.copyHash !== record.contentHash,
      );
      for (const link of copyLinks) {
        findings.push({
          id: `copy-drift:${key}:${link.agentId}`,
          rule: 'copy-drift',
          severity: 'warn',
          confidence: 'deterministic',
          title: message('finding.copyDrift.title', {
            name: record.name,
            agent: link.display,
          }),
          detail: message('finding.copyDrift.detail'),
          suggestion: message('finding.copyDrift.suggestion'),
          skills: [ref(record)],
          evidence: [link.path],
        });
      }

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
            evidence: [`lock=${lockHash.slice(0, 12)}…`, `local=${record.contentHash.slice(0, 12)}…`],
          });
        }
      } else {
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
            evidence: [`previous=${previous.slice(0, 12)}…`, `local=${record.contentHash.slice(0, 12)}…`],
          });
        }
      }

      for (const link of record.links) {
        if (link.state !== 'missing') continue;
        const declared = record.agentsDeclared.some(
          (item) => item.trim().toLowerCase() === link.display.toLowerCase(),
        );
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

    const lint: FindingMessage[] = [];
    if (!record.description) lint.push(message('finding.descriptionLint.missingDescription'));
    else if (record.description.length < 20) {
      lint.push(message('finding.descriptionLint.shortDescription'));
    }
    if (!record.triggers.hasWhenSignal) {
      lint.push(message('finding.descriptionLint.noWhenSignal'));
    }
    if (lint.length > 0) {
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
  }

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

  for (const orphan of orphans) {
    const key = `${orphan.scope}|${orphan.projectPath ?? ''}|${orphan.name}`;
    findings.push({
      id: `lock-missing-dir:${key}`,
      rule: 'lock-missing-dir',
      severity: 'error',
      confidence: 'deterministic',
      title: message('finding.lockMissingDir.title', { name: orphan.name }),
      detail: message('finding.lockMissingDir.detail', {
        source: orphan.entry.source,
        path: orphan.expectedPath,
      }),
      suggestion: message('finding.lockMissingDir.suggestion', { name: orphan.name }),
      skills: [
        {
          name: orphan.name,
          scope: orphan.scope,
          projectPath: orphan.projectPath,
          path: orphan.expectedPath,
        },
      ],
      evidence: [orphan.expectedPath, `source=${orphan.entry.source}`],
    });
  }

  const byName = new Map<string, SkillRecord[]>();
  for (const record of records) {
    const list = byName.get(record.name) ?? [];
    list.push(record);
    byName.set(record.name, list);
  }
  for (const [name, group] of byName) {
    const globals = group.filter((record) => record.scope === 'global');
    const projects = group.filter((record) => record.scope === 'project');
    if (globals.length === 0 || projects.length === 0) continue;
    for (const projectRecord of projects) {
      const globalRecord = globals[0]!;
      const differentSource =
        globalRecord.lock && projectRecord.lock && globalRecord.lock.source !== projectRecord.lock.source;
      findings.push({
        id: `${differentSource ? 'source-conflict' : 'shadowing'}:${name}:${projectRecord.projectPath ?? ''}`,
        rule: differentSource ? 'source-conflict' : 'shadowing',
        severity: differentSource ? 'warn' : 'info',
        confidence: 'deterministic',
        title: differentSource
          ? message('finding.sourceConflict.title', { name })
          : message('finding.shadowing.title', { name }),
        detail: differentSource
          ? message('finding.sourceConflict.detail', {
              globalSource: globalRecord.lock?.source ?? '?',
              projectSource: projectRecord.lock?.source ?? '?',
            })
          : message('finding.shadowing.detail'),
        suggestion: differentSource
          ? message('finding.sourceConflict.suggestion')
          : message('finding.shadowing.suggestion'),
        skills: [ref(globalRecord), ref(projectRecord)],
        evidence: [globalRecord.path, projectRecord.path],
      });
    }
  }

  const overlaps = computeOverlaps(records, thresholds.overlap);
  const byKey = new Map(records.map((record) => [recordKey(record), record]));
  const seenOverlapPairs = new Set<string>();
  for (const pair of overlaps) {
    const a = byKey.get(pair.aKey);
    const b = byKey.get(pair.bKey);
    if (!a || !b) continue;
    // Same name across scopes is covered by shadowing/source-conflict rules.
    if (a.name === b.name) continue;
    // Collapse the same semantic pair repeated across scopes.
    const pairKey = [a.name, b.name].sort().join('|');
    if (seenOverlapPairs.has(pairKey)) continue;
    seenOverlapPairs.add(pairKey);
    const shared = pair.shared;
    findings.push({
      id: `trigger-overlap:${pair.aKey}:${pair.bKey}`,
      rule: 'trigger-overlap',
      severity: 'info',
      confidence: 'heuristic',
      title: message('finding.triggerOverlap.title', { a: a.name, b: b.name }),
      detail:
        shared.length > 0
          ? message('finding.triggerOverlap.detail', {
              score: Math.round(pair.score * 100),
              cosine: Math.round(pair.cosine * 100),
              jaccard: Math.round(pair.jaccard * 100),
              shared,
            })
          : message('finding.triggerOverlap.detailNoShared', {
              score: Math.round(pair.score * 100),
              cosine: Math.round(pair.cosine * 100),
              jaccard: Math.round(pair.jaccard * 100),
            }),
      suggestion: message('finding.triggerOverlap.suggestion'),
      skills: [ref(a), ref(b)],
      evidence: shared,
      score: pair.score,
    });
  }

  const negativeHits: Finding[] = [];
  outer: for (const a of records) {
    for (const b of records) {
      if (a === b) continue;
      const positives = new Set(b.triggers.positive.map((term) => term.norm));
      for (const negative of a.triggers.negative) {
        if (!positives.has(negative.norm)) continue;
        negativeHits.push({
          id: `negative-contradiction:${recordKey(a)}:${recordKey(b)}:${negative.norm}`,
          rule: 'negative-contradiction',
          severity: 'info',
          confidence: 'heuristic',
          title: message('finding.negativeContradiction.title', { a: a.name, b: b.name }),
          detail: message('finding.negativeContradiction.detail', {
            term: negative.text,
            a: a.name,
            b: b.name,
          }),
          suggestion: message('finding.negativeContradiction.suggestion'),
          skills: [ref(a), ref(b)],
          evidence: [negative.text],
        });
        if (negativeHits.length >= 100) break outer;
      }
    }
  }
  findings.push(...negativeHits);

  const shingleCache = new Map<string, Set<string>>();
  const tokenCache = new Map<string, Set<string>>();
  const duplicates: Finding[] = [];
  const seenDuplicatePairs = new Set<string>();
  for (let i = 0; i < records.length; i += 1) {
    const a = records[i]!;
    if (a.body.length < 200) continue;
    const aKey = recordKey(a);
    const aTokens = tokenCache.get(aKey) ?? bodyShingles(a.body, 1);
    tokenCache.set(aKey, aTokens);
    for (let j = i + 1; j < records.length; j += 1) {
      const b = records[j]!;
      if (b.body.length < 200) continue;
      if (a.name === b.name) continue;
      const pairKey = [a.name, b.name].sort().join('|');
      if (seenDuplicatePairs.has(pairKey)) continue;
      const bKey = recordKey(b);
      const bTokens = tokenCache.get(bKey) ?? bodyShingles(b.body, 1);
      tokenCache.set(bKey, bTokens);
      if (jaccard(aTokens, bTokens) < 0.2) continue;
      const aShingles = shingleCache.get(aKey) ?? bodyShingles(a.body);
      shingleCache.set(aKey, aShingles);
      const bShingles = shingleCache.get(bKey) ?? bodyShingles(b.body);
      shingleCache.set(bKey, bShingles);
      const score = jaccard(aShingles, bShingles);
      if (score < thresholds.duplicate) continue;
      seenDuplicatePairs.add(pairKey);
      duplicates.push({
        id: `duplicate-content:${aKey}:${bKey}`,
        rule: 'duplicate-content',
        severity: 'warn',
        confidence: 'heuristic',
        title: message('finding.duplicateContent.title', { a: a.name, b: b.name }),
        detail: message('finding.duplicateContent.detail', {
          score: Math.round(score * 100),
        }),
        suggestion: message('finding.duplicateContent.suggestion'),
        skills: [ref(a), ref(b)],
        evidence: [],
        score,
      });
      if (duplicates.length >= 200) break;
    }
  }
  findings.push(...duplicates);

  const severityRank = { error: 0, warn: 1, info: 2 } as const;
  findings.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      (b.score ?? 0) - (a.score ?? 0) ||
      a.title.code.localeCompare(b.title.code) ||
      a.id.localeCompare(b.id),
  );
  return findings;
}
