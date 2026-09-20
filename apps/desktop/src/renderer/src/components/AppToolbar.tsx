/**
 * Top toolbar of the content area: current view title, active scope summary
 * and the global refresh / update-all actions.
 */
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { EvaluationProgress } from '@skillcat/core';
import { ChevronDown, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { useI18n } from '@renderer/lib/i18n';
import { TAB_LABEL_KEY, type Tab } from '@renderer/lib/navigation';

function RefreshControl({
  onRescan,
  onDeepScan,
  busy,
}: {
  onRescan: () => void;
  onDeepScan: () => void;
  busy: boolean;
}): React.ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('app.refreshOptions')}
        onClick={() => setOpen((current) => !current)}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        {busy ? t('app.scanning') : t('app.refresh')}
        <ChevronDown />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-72 rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="focus-ring flex w-full flex-col items-start gap-0.5 rounded-sm px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
            onClick={() => choose(onRescan)}
          >
            <span className="font-medium">{t('app.refresh')}</span>
            <span className="text-[11px] text-muted-foreground">{t('app.refreshHint')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="focus-ring flex w-full flex-col items-start gap-0.5 rounded-sm px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
            onClick={() => choose(onDeepScan)}
          >
            <span className="font-medium">{t('app.deepRefresh')}</span>
            <span className="text-[11px] text-muted-foreground">{t('app.deepRefreshHint')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppToolbar({
  tab,
  scopeLabel,
  recordCount,
  refreshing,
  onRefresh,
  onDeepRefresh,
  onUpdateAll,
  onEvaluate,
  evaluateDisabled,
  evaluating,
  evaluateProgress,
  onReviewCandidates,
  reviewDisabled,
  reviewing,
}: {
  tab: Tab;
  scopeLabel: string;
  recordCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onDeepRefresh: () => void;
  onUpdateAll: () => void;
  onEvaluate: () => void;
  evaluateDisabled: boolean;
  evaluating: boolean;
  evaluateProgress: EvaluationProgress | null;
  onReviewCandidates: () => void;
  reviewDisabled: boolean;
  reviewing: boolean;
}): React.ReactElement {
  const { t } = useI18n();

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3.5 py-2.5">
      <strong className="font-semibold">{t(TAB_LABEL_KEY[tab])}</strong>
      {tab === 'skills' ? (
        <span className="text-[11px] text-muted-foreground">
          {t('app.scopeSummary', { label: scopeLabel, count: recordCount })}
        </span>
      ) : null}
      <div className="flex-1" />
      <RefreshControl onRescan={onRefresh} onDeepScan={onDeepRefresh} busy={refreshing} />
      {tab === 'skills' ? (
        <Button size="sm" onClick={onUpdateAll}>
          {t('app.updateAll')}
        </Button>
      ) : null}
      {tab === 'analysis' ? (
        <>
          <Button
            size="sm"
            onClick={onEvaluate}
            disabled={evaluateDisabled}
            title={!evaluating && evaluateDisabled ? t('app.evaluateHint') : undefined}
          >
            {evaluating ? <LoaderCircle className="animate-spin" /> : null}
            {evaluating
              ? evaluateProgress && evaluateProgress.total > 0
                ? t('app.evaluateRunning', {
                    done: evaluateProgress.done,
                    total: evaluateProgress.total,
                  })
                : t('app.evaluating')
              : t('app.evaluate')}
          </Button>
          <Button
            size="sm"
            onClick={onReviewCandidates}
            disabled={reviewDisabled}
            title={!reviewing && reviewDisabled ? t('app.evaluateHint') : undefined}
          >
            {reviewing ? <LoaderCircle className="animate-spin" /> : null}
            {reviewing ? t('app.reviewing') : t('app.reviewCandidates')}
          </Button>
        </>
      ) : null}
    </div>
  );
}
