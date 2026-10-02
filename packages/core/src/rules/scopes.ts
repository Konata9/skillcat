/**
 * Cross-scope rules: lock entries whose directory is gone, and same-name skills
 * that exist both globally and in a project (shadowing / source conflict).
 */
import { scopeNameKey } from '../keys.js';
import type { Finding, SkillRecord } from '../types.js';
import { message, ref, type AnalysisRule } from './helpers.js';

/** The lock file references a skill directory that no longer exists. */
export const lockMissingDirRule: AnalysisRule = ({ orphans }) => {
  const findings: Finding[] = [];
  for (const orphan of orphans) {
    const key = scopeNameKey(orphan.scope, orphan.projectPath, orphan.name);
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
  return findings;
};

/** A global skill is shadowed by a project skill; a differing source escalates. */
export const shadowingRule: AnalysisRule = ({ records }) => {
  const byName = new Map<string, SkillRecord[]>();
  for (const record of records) {
    const list = byName.get(record.name) ?? [];
    list.push(record);
    byName.set(record.name, list);
  }

  const findings: Finding[] = [];
  for (const [name, group] of byName) {
    const globals = group.filter((record) => record.scope === 'global');
    const projects = group.filter((record) => record.scope === 'project');
    if (globals.length === 0 || projects.length === 0) continue;
    for (const projectRecord of projects) {
      const globalRecord = globals[0]!;
      const differentSource =
        globalRecord.lock &&
        projectRecord.lock &&
        globalRecord.lock.source !== projectRecord.lock.source;
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
  return findings;
};
