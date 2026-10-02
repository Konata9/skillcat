/**
 * Project registry list. Reloads whenever a scan finishes (`scannedAt`
 * changes) and exposes a manual `reload` for pin/add/rescan actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectInfo } from '@skillcat/core';
import type { SkillCatApi } from '@shared/contract';

export interface ProjectsController {
  projects: ProjectInfo[];
  reload: () => Promise<void>;
}

export function useProjects(
  api: SkillCatApi,
  scannedAt: string | null | undefined,
): ProjectsController {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const next = await api.listProjects();
    if (mounted.current) setProjects(next);
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload, scannedAt]);

  return { projects, reload };
}
