/**
 * Inline notice banners: missing CLI and missing scan roots. Both are
 * non-blocking hints shown under the toolbar.
 */
import * as React from 'react';
import { Button } from './ui/button';
import { useI18n } from '@renderer/lib/i18n';

export function AppNotices({
  cliAvailable,
  cliError,
  showNoRoots,
  onGoToSettings,
}: {
  cliAvailable: boolean;
  cliError?: string;
  showNoRoots: boolean;
  onGoToSettings: () => void;
}): React.ReactElement | null {
  const { t } = useI18n();

  if (cliAvailable && !showNoRoots) return null;

  return (
    <>
      {!cliAvailable ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3.5 py-1.5">
          <span className="text-destructive">
            {t('app.cliUnavailableBanner', { error: cliError ?? 'unknown error' })}
          </span>
        </div>
      ) : null}

      {showNoRoots ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3.5 py-1.5">
          <span>{t('app.noRootsBanner')}</span>
          <Button size="sm" onClick={onGoToSettings}>
            {t('app.goToSettings')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
