import * as React from 'react';
import type { SkillRecord } from '@skillman/core';
import { recordKey } from '@skillman/core/keys';
import { formatBytes } from '@renderer/lib/format';
import { useI18n } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import { Badge } from './ui/badge';
import { EmptyState } from './indicators';

export function SkillList({
  records,
  selectedKey,
  onSelect,
  filterActive = false,
}: {
  records: SkillRecord[];
  selectedKey: string | null;
  onSelect: (record: SkillRecord) => void;
  filterActive?: boolean;
}): React.ReactElement {
  const { t, relativeTime, scopeLabel } = useI18n();

  if (records.length === 0) {
    return <EmptyState>{filterActive ? t('skillList.emptyFiltered') : t('skillList.empty')}</EmptyState>;
  }

  return (
    <div className="p-1.5">
      {records.map((record) => {
        const key = recordKey(record);
        const selected = key === selectedKey;
        const dangling = record.links.some((link) => link.state === 'symlink-dangling');
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(record)}
            className={cn(
              'focus-ring block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/60',
              selected && 'bg-primary/10',
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5 font-medium">
              <span className="truncate">{record.name}</span>
              {record.lock === null ? <Badge tone="warn">{t('badge.manual')}</Badge> : null}
              {record.internal ? <Badge>{t('badge.internal')}</Badge> : null}
              {dangling ? <Badge tone="error">{t('badge.dangling')}</Badge> : null}
            </div>
            <div className="mt-0.5 line-clamp-2 text-muted-foreground">
              {record.description || t('skillList.noDescription')}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{record.source ?? t('skillList.manual')}</span>
              <span>{scopeLabel(record.scope, record.projectPath)}</span>
              <span>{formatBytes(record.sizeBytes)}</span>
              <span>
                {t('skillList.updated', {
                  time: relativeTime(record.updatedAt ?? new Date(record.mtimeMs).toISOString()),
                })}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
