/**
 * Project registry list. Reloads whenever a scan finishes (`scannedAt`
 * changes) and exposes a manual `reload` for pin/add/rescan actions.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ProjectInfo } from '@skillman/core';
import type { SkillmanApi } from '@shared/contract';

export interface ProjectsController {
  projects: ProjectInfo[];
  reload: () => Promise<void>;
}

export function useProjects(
  api: SkillmanApi,
  scannedAt: string | null | undefined,
): ProjectsController {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  const reload = useCallback(async () => {
    setProjects(await api.listProjects());
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload, scannedAt]);

  return { projects, reload };
}
