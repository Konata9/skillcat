// deslop-ignore-file 34: 规则名与证据条目是技术标识与数据值
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { Finding } from '@skillcat/core';
import { recordKey } from '@skillcat/core/keys';
import { useI18n } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import { EmptyState, SeverityDot } from '../components/indicators';
import { Badge } from '../components/ui/badge';

type SeverityFilter = 'all' | 'error' | 'warn' | 'info';

const SEVERITY_TONE = {
  error: 'error',
  warn: 'warn',
  info: 'accent',
} as const;

export function ConflictsView({ findings }: { findings: Finding[] }): React.ReactElement {
  const { t, formatMessage, scopeLabel } = useI18n();
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const severityLabel: Record<string, string> = {
    error: t('conflicts.severity.error'),
    warn: t('conflicts.severity.warn'),
    info: t('conflicts.severity.info'),
  };

  const filtered = useMemo(
    () => (filter === 'all' ? findings : findings.filter((finding) => finding.severity === filter)),
    [findings, filter],
  );

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!filtered.some((finding) => finding.id === selectedId)) {
      setSelectedId(filtered[0]!.id);
    }
  }, [filtered, selectedId]);

  const selected = filtered.find((finding) => finding.id === selectedId) ?? null;

  return (
    <div className="grid min-h-0 flex-1 grid-rows-1 grid-cols-[minmax(320px,42%)_1fr]">
      <section className="flex min-h-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-3.5 py-2">
          {(['all', 'error', 'warn', 'info'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                'focus-ring rounded border border-transparent px-2.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground',
                filter === value && 'border-input bg-secondary text-foreground',
              )}
            >
              {value === 'all' ? t('conflicts.all', { count: findings.length }) : severityLabel[value]}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState>{t('conflicts.emptyLevel')}</EmptyState>
          ) : (
            <div className="p-1.5">
              {filtered.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => setSelectedId(finding.id)}
                  className={cn(
                    'focus-ring block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/60',
                    finding.id === selectedId && 'bg-primary/10',
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <SeverityDot severity={finding.severity} />
                    <span>{formatMessage(finding.title)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">{finding.rule}</span>
                    <span>
                      {finding.confidence === 'deterministic'
                        ? t('conflicts.deterministic')
                        : t('conflicts.heuristic')}
                    </span>
                    {finding.score !== undefined ? (
                      <span>{t('conflicts.similarity', { value: Math.round(finding.score * 100) })}</span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="min-h-0 overflow-y-auto">
        {selected ? (
          <div className="max-w-[900px] px-4 pt-4 pb-10">
            <h1 className="text-xl font-semibold">{formatMessage(selected.title)}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={SEVERITY_TONE[selected.severity]}>
                {severityLabel[selected.severity]}
              </Badge>
              <Badge>{selected.rule}</Badge>
              <Badge>
                {selected.confidence === 'deterministic'
                  ? t('conflicts.deterministic')
                  : t('conflicts.heuristic')}
              </Badge>
            </div>

            <h2 className="mt-5 mb-2 text-[11px] font-medium tracking-wider text-muted-foreground">
              {t('conflicts.detailHeading')}
            </h2>
            <div className="max-w-[65ch]">{formatMessage(selected.detail)}</div>

            {selected.suggestion ? (
              <>
                <h2 className="mt-5 mb-2 text-[11px] font-medium tracking-wider text-muted-foreground">
                  {t('conflicts.suggestionHeading')}
                </h2>
                <div className="max-w-[65ch] text-muted-foreground">
                  {formatMessage(selected.suggestion)}
                </div>
              </>
            ) : null}

            {selected.evidence.length > 0 ? (
              <>
                <h2 className="mt-5 mb-2 text-[11px] font-medium tracking-wider text-muted-foreground">
                  {t('conflicts.evidenceHeading')}
                </h2>
                <div className="flex flex-col gap-1">
                  {selected.evidence.map((item) => (
                    <div key={item} className="font-mono text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {selected.skills.length > 0 ? (
              <>
                <h2 className="mt-5 mb-2 text-[11px] font-medium tracking-wider text-muted-foreground">
                  {t('conflicts.skillsHeading')}
                </h2>
                <div className="flex flex-col gap-1">
                  {selected.skills.map((skill) => (
                    <div key={recordKey(skill)} className="text-muted-foreground">
                      {t('conflicts.skillScope', {
                        name: skill.name,
                        scope: scopeLabel(skill.scope, skill.projectPath),
                      })}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <EmptyState>{t('conflicts.selectHint')}</EmptyState>
        )}
      </section>
    </div>
  );
}
