// deslop-ignore-file 34: 本文件展示路径、hash、原始正文等数据值，等宽字体是内容要求
import * as React from 'react';
import type { SkillRecord } from '@skillcat/core';
import { FileText, FolderOpen, PencilLine, RefreshCw, Trash2 } from 'lucide-react';
import { formatBytes } from '@renderer/lib/format';
import { useI18n } from '@renderer/lib/i18n';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableRow } from './ui/table';
import { TriggersPanel } from './TriggersPanel';

export interface SkillDetailActions {
  onOpen: (record: SkillRecord) => void;
  onReveal: (record: SkillRecord) => void;
  onEditTriggers: (record: SkillRecord) => void;
  onUpdate: (record: SkillRecord) => void;
  onRemove: (record: SkillRecord) => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mt-5">
      <h2 className="section-label mb-2">{title}</h2>
      {children}
    </section>
  );
}

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <span className="mr-1.5 text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function SkillDetail({
  record,
  onOpen,
  onReveal,
  onEditTriggers,
  onUpdate,
  onRemove,
}: { record: SkillRecord } & SkillDetailActions): React.ReactElement {
  const { t, relativeTime, scopeLabel } = useI18n();

  const linkCounts = record.links.reduce<Record<string, number>>((acc, link) => {
    acc[link.state] = (acc[link.state] ?? 0) + 1;
    return acc;
  }, {});
  const dangling = record.links.filter((link) => link.state === 'symlink-dangling');

  return (
    <div className="max-w-[900px] px-4 pt-4 pb-10">
      <h1 className="text-xl font-semibold">{record.name}</h1>
      <div className="mt-0.5 font-mono break-all text-muted-foreground">{record.path}</div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{scopeLabel(record.scope, record.projectPath)}</Badge>
        {record.source ? <Badge>{record.source}</Badge> : <Badge tone="warn">{t('skillList.manual')}</Badge>}
        {record.internal ? <Badge>{t('badge.internal')}</Badge> : null}
        {record.bodyTruncated ? <Badge>{t('detail.bodyTruncated')}</Badge> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => onOpen(record)}>
          <FileText />
          {t('detail.open')}
        </Button>
        <Button size="sm" onClick={() => onReveal(record)}>
          <FolderOpen />
          {t('detail.reveal')}
        </Button>
        <Button size="sm" onClick={() => onEditTriggers(record)}>
          <PencilLine />
          {t('detail.editTriggers')}
        </Button>
        <Button size="sm" onClick={() => onUpdate(record)}>
          <RefreshCw />
          {t('detail.update')}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onRemove(record)}>
          <Trash2 />
          {t('detail.remove')}
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-5 gap-y-2 ">
        <MetaItem label={t('detail.metaInstalled')}>{relativeTime(record.installedAt)}</MetaItem>
        <MetaItem label={t('detail.metaUpdated')}>{relativeTime(record.updatedAt)}</MetaItem>
        <MetaItem label={t('detail.metaHash')}>
          <span className="font-mono">{record.contentHash.slice(0, 12)}</span>
        </MetaItem>
        <MetaItem label={t('detail.metaSize')}>
          {t('detail.sizeValue', {
            bytes: formatBytes(record.sizeBytes),
            n: record.files.length,
          })}
        </MetaItem>
      </div>

      <Section title={t('detail.description')}>
        <div className="max-w-[65ch] text-muted-foreground">
          {record.description || t('skillList.noDescription')}
        </div>
      </Section>

      <Section title={t('detail.triggerProfile')}>
        <TriggersPanel triggers={record.triggers} />
      </Section>

      <Section title={t('detail.links')}>
        <div className="text-muted-foreground">
          {t('detail.linkSummary', {
            canonical: linkCounts.canonical ?? 0,
            symlink: linkCounts['symlink-ok'] ?? 0,
            missing: linkCounts.missing ?? 0,
            copy: linkCounts.copy ?? 0,
            dangling: linkCounts['symlink-dangling'] ?? 0,
          })}
        </div>
        {dangling.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1">
            {dangling.map((link) => (
              <div key={link.agentId} className="font-mono text-destructive">
                {link.display}: {link.path} → {link.target ?? '?'}
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      {record.files.length > 1 ? (
        <Section title={t('detail.files', { count: record.files.length })}>
          <Table>
            <TableBody>
              {record.files.slice(0, 30).map((file) => (
                <TableRow key={file.relativePath} className="hover:bg-transparent">
                  <TableCell className="w-[70px] py-1 font-mono text-[11px] text-muted-foreground">
                    {file.kind}
                  </TableCell>
                  <TableCell className="py-1 font-mono text-muted-foreground">
                    {file.relativePath}
                  </TableCell>
                  <TableCell className="w-[70px] py-1 text-right text-muted-foreground tabular-nums">
                    {formatBytes(file.size)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {record.files.length > 30 ? (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {t('detail.filesMore', { n: record.files.length - 30 })}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title={t('detail.body')}>
        <pre className="max-h-[420px] overflow-auto rounded-md border border-border bg-card p-3 font-mono leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {record.body}
        </pre>
      </Section>
    </div>
  );
}
