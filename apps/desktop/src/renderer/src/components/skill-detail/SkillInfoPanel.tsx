// deslop-ignore-file 34: 本文件展示路径、hash、原始正文等数据值，等宽字体是内容要求
import * as React from 'react';
import type { SkillRecord } from '@skillcat/core';
import { formatBytes } from '@renderer/lib/format';
import { useI18n } from '@renderer/lib/i18n';
import { Section } from '../ui/section';
import { Table, TableBody, TableCell, TableRow } from '../ui/table';
import { TriggersPanel } from '../TriggersPanel';

function MetaDatum({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground/70">{label}</span>
      {children}
    </span>
  );
}

/** Metadata, description, trigger profile, links, files and raw body. */
export function SkillInfoPanel({
  record,
  triggerCount,
}: {
  record: SkillRecord;
  triggerCount?: number;
}): React.ReactElement {
  const { t, relativeTime } = useI18n();

  const linkCounts = record.links.reduce<Record<string, number>>((acc, link) => {
    acc[link.state] = (acc[link.state] ?? 0) + 1;
    return acc;
  }, {});
  const dangling = record.links.filter((link) => link.state === 'symlink-dangling');

  return (
    <div className="max-w-[900px] px-4 pt-4 pb-10">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4">
        <MetaDatum label={t('detail.metaInstalled')}>{relativeTime(record.installedAt)}</MetaDatum>
        <span className="text-border" aria-hidden="true">
          ·
        </span>
        <MetaDatum label={t('detail.metaUpdated')}>{relativeTime(record.updatedAt)}</MetaDatum>
        <span className="text-border" aria-hidden="true">
          ·
        </span>
        <MetaDatum label={t('detail.metaHash')}>
          <span className="font-mono" title={record.contentHash}>
            {record.contentHash.slice(0, 12)}
          </span>
        </MetaDatum>
        <span className="text-border" aria-hidden="true">
          ·
        </span>
        <MetaDatum label={t('detail.metaSize')}>
          {t('detail.sizeValue', {
            bytes: formatBytes(record.sizeBytes),
            n: record.files.length,
          })}
        </MetaDatum>
        {triggerCount ? (
          <>
            <span className="text-border" aria-hidden="true">
              ·
            </span>
            <MetaDatum label={t('detail.metaTriggers')}>
              {t('detail.triggerCount', { n: triggerCount })}
            </MetaDatum>
          </>
        ) : null}
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
