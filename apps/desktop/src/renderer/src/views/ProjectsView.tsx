import * as React from 'react';
import type { ProjectInfo } from '@skillman/core';
import { FolderPlus, RefreshCw, Star } from 'lucide-react';
import { useI18n } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import { EmptyState } from '../components/indicators';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export function ProjectsView({
  projects,
  onPin,
  onRemove,
  onAdd,
  onRescan,
}: {
  projects: ProjectInfo[];
  onPin: (project: ProjectInfo) => void;
  onRemove: (project: ProjectInfo) => void;
  onAdd: () => void;
  onRescan: () => void;
}): React.ReactElement {
  const { t } = useI18n();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-2 text-[11px] text-muted-foreground">
        <span>{t('projects.summary', { n: projects.length })}</span>
        <div className="flex-1" />
        <Button size="sm" onClick={onAdd}>
          <FolderPlus />
          {t('projects.add')}
        </Button>
        <Button size="sm" onClick={onRescan}>
          <RefreshCw />
          {t('projects.rescan')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <EmptyState>{t('projects.empty')}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-9" />
                <TableHead>{t('projects.tableProject')}</TableHead>
                <TableHead>{t('projects.tablePath')}</TableHead>
                <TableHead className="w-20">{t('projects.tableSkills')}</TableHead>
                <TableHead>{t('projects.tableMarkers')}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.path}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={project.pinned ? t('projects.unpin') : t('projects.pin')}
                      aria-label={project.pinned ? t('projects.unpin') : t('projects.pin')}
                      onClick={() => onPin(project)}
                    >
                      <Star className={cn(project.pinned && 'fill-warning text-warning')} />
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span>{project.name}</span>
                      {project.registered ? (
                        <Badge tone="success">{t('projects.registered')}</Badge>
                      ) : null}
                      {project.error ? <Badge tone="error">{t('projects.scanError')}</Badge> : null}
                    </div>
                  </TableCell>
                  {/* deslop-ignore-next-line 34: 项目路径是数据值 */}
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {project.path}
                  </TableCell>
                  <TableCell className="tabular-nums">{project.skillCount ?? '—'}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {project.markers.join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    {project.registered ? (
                      <Button size="sm" onClick={() => onRemove(project)}>
                        {t('projects.unregister')}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
