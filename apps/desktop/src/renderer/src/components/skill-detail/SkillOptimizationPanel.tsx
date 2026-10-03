// deslop-ignore-file 34: 建议可能包含原始/改写片段，等宽字体是内容要求
import * as React from 'react';
import type { OptimizationSeverity, SkillOptimization, SkillRecord } from '@skillcat/core';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { useI18n, type MessageKey } from '@renderer/lib/i18n';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

const SUGGESTION_TONE: Record<OptimizationSeverity, 'error' | 'warn' | undefined> = {
  high: 'error',
  medium: 'warn',
  low: undefined,
};

const SUGGESTION_SEVERITY_KEY: Record<OptimizationSeverity, MessageKey> = {
  high: 'detail.severity.high',
  medium: 'detail.severity.medium',
  low: 'detail.severity.low',
};

/** Read-only optimization: the generation CTA plus the resulting suggestions. */
export function SkillOptimizationPanel({
  record,
  optimization,
  optimizing,
  optimizationError,
  llmConfigured,
  onOptimize,
  onOpenSettings,
}: {
  record: SkillRecord;
  optimization: SkillOptimization | null;
  optimizing: boolean;
  optimizationError: string | null;
  llmConfigured: boolean;
  onOptimize: (record: SkillRecord) => void;
  onOpenSettings: () => void;
}): React.ReactElement {
  const { t, relativeTime } = useI18n();

  return (
    <div className="max-w-[900px] px-4 pt-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onOptimize(record)}
          disabled={!llmConfigured || optimizing}
          title={!llmConfigured ? t('detail.optimizeNeedsLlm') : undefined}
        >
          {optimizing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          {optimizing
            ? t('detail.optimizing')
            : optimization
              ? t('detail.optimizeRegenerate')
              : t('detail.optimize')}
        </Button>
        {!llmConfigured ? (
          <>
            <span className="text-[11px] text-muted-foreground">{t('detail.optimizeNeedsLlm')}</span>
            <Button variant="outline" size="sm" onClick={onOpenSettings}>
              {t('detail.optimizeGoSettings')}
            </Button>
          </>
        ) : null}
      </div>

      {optimizationError ? (
        <div className="mt-3 text-destructive">
          {t('detail.optimizationFailed', { message: optimizationError })}
        </div>
      ) : null}

      {optimization ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="text-[11px] text-muted-foreground">
            {t('detail.optimizationMeta', {
              time: relativeTime(optimization.generatedAt),
              model: optimization.model,
            })}
          </div>
          {optimization.summary ? (
            <div>
              <div className="section-label">{t('detail.optimizationSummary')}</div>
              <div className="max-w-[65ch] text-muted-foreground">{optimization.summary}</div>
            </div>
          ) : null}
          {optimization.suggestions.length === 0 ? (
            <div className="text-muted-foreground">{t('detail.optimizationEmpty')}</div>
          ) : (
            <ol className="flex flex-col gap-2">
              {optimization.suggestions.map((suggestion, index) => (
                <li
                  key={`${index}-${suggestion.title}`}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone={SUGGESTION_TONE[suggestion.severity]}>
                      {t(SUGGESTION_SEVERITY_KEY[suggestion.severity])}
                    </Badge>
                    <span className="font-medium">{suggestion.title}</span>
                  </div>
                  {suggestion.rationale ? (
                    <div className="mt-1 max-w-[65ch] text-muted-foreground">
                      {suggestion.rationale}
                    </div>
                  ) : null}
                  {suggestion.before ? (
                    <div className="mt-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {t('detail.suggestionBefore')}
                      </span>
                      <pre className="mt-0.5 overflow-auto rounded border border-border bg-card p-2 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                        {suggestion.before}
                      </pre>
                    </div>
                  ) : null}
                  {suggestion.after ? (
                    <div className="mt-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {t('detail.suggestionAfter')}
                      </span>
                      <pre className="mt-0.5 overflow-auto rounded border border-border bg-card p-2 font-mono text-[11px] whitespace-pre-wrap">
                        {suggestion.after}
                      </pre>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
