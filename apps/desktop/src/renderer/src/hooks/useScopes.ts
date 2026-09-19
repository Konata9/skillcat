/**
 * Scope sidebar model: derives the global + per-project scope list from the
 * snapshot, keeps the selection valid when scopes appear or disappear, and
 * returns the records of the active scope.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Scope, SkillRecord } from '@skillcat/core';
import type { Snapshot } from '@shared/contract';

export interface ScopeOption {
  key: string;
  label: string;
  path: string | null;
  count: number;
}

export interface ScopesController {
  scopes: ScopeOption[];
  scopeKey: string;
  setScopeKey: (key: string) => void;
  activeScope: ScopeOption;
  records: SkillRecord[];
}

export function useScopes(
  snapshot: Snapshot | null,
  scopeLabel: (scope: Scope, projectPath?: string) => string,
): ScopesController {
  const [scopeKey, setScopeKey] = useState('global');

  const scopes = useMemo<ScopeOption[]>(() => {
    const list: ScopeOption[] = [
      {
        key: 'global',
        label: scopeLabel('global'),
        path: null,
        count: snapshot?.global.length ?? 0,
      },
    ];
    for (const project of snapshot?.projects ?? []) {
      list.push({
        key: `project:${project.path}`,
        label: project.path.split('/').filter(Boolean).pop() ?? project.path,
        path: project.path,
        count: project.records.length,
      });
    }
    return list;
  }, [snapshot, scopeLabel]);

  useEffect(() => {
    if (!scopes.some((scope) => scope.key === scopeKey)) setScopeKey('global');
  }, [scopes, scopeKey]);

  const activeScope = scopes.find((scope) => scope.key === scopeKey) ?? scopes[0]!;

  const records = useMemo(() => {
    if (scopeKey === 'global') return snapshot?.global ?? [];
    return (
      snapshot?.projects.find((project) => `project:${project.path}` === scopeKey)?.records ?? []
    );
  }, [snapshot, scopeKey]);

  return { scopes, scopeKey, setScopeKey, activeScope, records };
}
