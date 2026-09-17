/**
 * Top toolbar of the content area: current view title, active scope summary
 * and the global refresh / update-all actions.
 */
import * as React from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { useI18n } from '@renderer/lib/i18n';
import { TAB_LABEL_KEY, type Tab } from '@renderer/lib/navigation';

export function AppToolbar({
  tab,
  scopeLabel,
  recordCount,
  onRefresh,
  onDeepRefresh,
  onUpdateAll,
}: {
  tab: Tab;
  scopeLabel: string;
  recordCount: number;
  onRefresh: () => void;
  onDeepRefresh: () => void;
  onUpdateAll: () => void;
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
      <Button size="sm" onClick={onRefresh}>
        <RefreshCw />
        {t('app.refresh')}
      </Button>
      <Button size="sm" onClick={onDeepRefresh}>
        <RotateCcw />
        {t('app.deepRefresh')}
      </Button>
      {tab === 'skills' ? (
        <Button size="sm" onClick={onUpdateAll}>
          {t('app.updateAll')}
        </Button>
      ) : null}
    </div>
  );
}
