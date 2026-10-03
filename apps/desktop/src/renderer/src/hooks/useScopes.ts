/**
 * Scope sidebar model: derives the global + per-project scope list from the
 * snapshot, keeps the selection valid when scopes appear or disappear, and
 * returns the records of the active scope.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ProjectInfo, Scope, SkillRecord } from '@skillcat/core';
import { projectName } from '@renderer/lib/format';
import type { Snapshot } from '@shared/contract';

export interface ScopeOption {
  key: string;
  label: string;
  path: string | null;
  count: number;
  pinned: boolean;
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
  projects: ProjectInfo[] = [],
): ScopesController {
  const [scopeKey, setScopeKey] = useState('global');

  const scopes = useMemo<ScopeOption[]>(() => {
    const pinnedByPath = new Map(projects.map((project) => [project.path, project.pinned]));
    const projectScopes: ScopeOption[] = (snapshot?.projects ?? []).map((project) => ({
      key: `project:${project.path}`,
      label: projectName(project.path),
      path: project.path,
      count: project.records.length,
      pinned: pinnedByPath.get(project.path) === true,
    }));
    // Pinned projects float to the top; Array.sort is stable, so ties keep scan order.
    projectScopes.sort((a, b) => Number(b.pinned) - Number(a.pinned));

    const global: ScopeOption = {
      key: 'global',
      label: scopeLabel('global'),
      path: null,
      count: snapshot?.global.length ?? 0,
      pinned: false,
    };
    return [global, ...projectScopes];
  }, [snapshot, scopeLabel, projects]);

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
