// deslop-ignore-file 34: 本文件展示路径、hash 等数据值，等宽字体是内容要求
import * as React from 'react';
import type { SkillRecord } from '@skillcat/core';
import { FileText, FolderOpen, PencilLine, RefreshCw, Trash2 } from 'lucide-react';
import { useI18n } from '@renderer/lib/i18n';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export interface SkillDetailActions {
  onOpen: (record: SkillRecord) => void;
  onReveal: (record: SkillRecord) => void;
  onEditTriggers: (record: SkillRecord) => void;
  onUpdate: (record: SkillRecord) => void;
  onRemove: (record: SkillRecord) => void;
}

/** Pinned identity + actions of the selected skill, above the detail tabs. */
export function SkillDetailHeader({
  record,
  onOpen,
  onReveal,
  onEditTriggers,
  onUpdate,
  onRemove,
}: { record: SkillRecord } & SkillDetailActions): React.ReactElement {
  const { t, scopeLabel } = useI18n();

  return (
    <div className="shrink-0 border-b border-border px-4 pt-4 pb-2">
      <div className="flex max-w-[900px] flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-xl font-semibold">{record.name}</h1>
            <Badge tone="accent">{scopeLabel(record.scope, record.projectPath)}</Badge>
            {record.source ? (
              <Badge>{record.source}</Badge>
            ) : (
              <Badge tone="warn">{t('skillList.manual')}</Badge>
            )}
            {record.internal ? <Badge>{t('badge.internal')}</Badge> : null}
            {record.bodyTruncated ? <Badge>{t('detail.bodyTruncated')}</Badge> : null}
          </div>
          <div className="mt-0.5 font-mono break-all text-muted-foreground">{record.path}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" onClick={() => onOpen(record)}>
            <FileText />
            {t('detail.open')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title={t('detail.reveal')}
            aria-label={t('detail.reveal')}
            onClick={() => onReveal(record)}
          >
            <FolderOpen />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title={t('detail.editTriggers')}
            aria-label={t('detail.editTriggers')}
            onClick={() => onEditTriggers(record)}
          >
            <PencilLine />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title={t('detail.update')}
            aria-label={t('detail.update')}
            onClick={() => onUpdate(record)}
          >
            <RefreshCw />
          </Button>
          <Button
            size="icon"
            variant="ghost-destructive"
            title={t('detail.remove')}
            aria-label={t('detail.remove')}
            onClick={() => onRemove(record)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}
