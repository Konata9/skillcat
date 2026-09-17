import * as React from 'react';
import type { TriggerProfile, TriggerTerm } from '@skillman/core';
import { useI18n } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';

const SOURCE_LABEL: Record<string, string> = {
  when_to_use: 'when_to_use',
  dispatch_intent: 'intent',
  description: 'desc',
  body: 'body',
  name: 'name',
  user: 'user',
};

function Chip({
  term,
  kind,
}: {
  term: TriggerTerm;
  kind: 'positive' | 'negative';
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2 py-0.5 ',
        kind === 'negative' ? 'border-destructive/30' : 'border-border',
        term.user && 'border-warning/40',
      )}
    >
      {term.text}
      {/* deslop-ignore-next-line 34: 来源标签是 frontmatter 的原始键名 */}
      <span className="font-mono text-[11px] text-muted-foreground">
        {SOURCE_LABEL[term.source] ?? term.source}
      </span>
    </span>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function TriggersPanel({ triggers }: { triggers: TriggerProfile }): React.ReactElement {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3">
      <Group label={t('triggers.positive', { count: triggers.positive.length })}>
        {triggers.positive.length === 0 ? (
          <span className="text-muted-foreground">{t('triggers.none')}</span>
        ) : null}
        {triggers.positive.map((term) => (
          <Chip key={`p:${term.norm}`} term={term} kind="positive" />
        ))}
      </Group>

      {triggers.negative.length > 0 ? (
        <Group label={t('triggers.negative', { count: triggers.negative.length })}>
          {triggers.negative.map((term) => (
            <Chip key={`n:${term.norm}`} term={term} kind="negative" />
          ))}
        </Group>
      ) : null}

      {triggers.intents.length > 0 ? (
        <Group label={t('triggers.intents', { count: triggers.intents.length })}>
          {triggers.intents.map((intent) => (
            <span
              key={intent}
              className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 "
            >
              {intent}
            </span>
          ))}
        </Group>
      ) : null}

      {!triggers.hasWhenSignal ? (
        <div className="text-warning">{t('triggers.noSignal')}</div>
      ) : null}
    </div>
  );
}
