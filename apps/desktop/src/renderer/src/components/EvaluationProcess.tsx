import * as React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { EvaluationEvent, EvaluationStepCode } from '@skillcat/core';
import { LoaderCircle } from 'lucide-react';
import { useI18n } from '@renderer/lib/i18n';

type Row =
  | { kind: 'step'; code: EvaluationStepCode; params?: Record<string, string | number> }
  | { kind: 'reasoning'; text: string };

function collapse(events: EvaluationEvent[]): Row[] {
  const rows: Row[] = [];
  for (const event of events) {
    if (event.type === 'step' && event.step) {
      rows.push({ kind: 'step', code: event.step.code, params: event.step.params });
    } else if (event.type === 'reasoning' && event.text) {
      const last = rows.at(-1);
      if (last && last.kind === 'reasoning') last.text += event.text;
      else rows.push({ kind: 'reasoning', text: event.text });
    }
  }
  return rows;
}

/** Live process log shown in the AI pane while an evaluation is running. */
export function EvaluationProcess({ events }: { events: EvaluationEvent[] }): React.ReactElement {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => collapse(events), [events]);

  useEffect(() => {
    const element = containerRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [rows]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5 text-[11px] font-medium text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        {t('analysis.aiProcess')}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {rows.length === 0 ? (
          <div className="text-muted-foreground">{t('analysis.aiEvaluating')}</div>
        ) : null}
        <ol className="flex flex-col gap-2">
          {rows.map((row, index) =>
            row.kind === 'step' ? (
              <li key={index} className="flex gap-2 text-muted-foreground">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{t(row.code, row.params ?? {})}</span>
              </li>
            ) : (
              <li
                key={index}
                className="border-l-2 border-border pl-3 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground/80"
              >
                {row.text}
              </li>
            ),
          )}
        </ol>
      </div>
    </div>
  );
}
