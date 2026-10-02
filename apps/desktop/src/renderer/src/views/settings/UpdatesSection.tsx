import * as React from 'react';
import type { UpdateCheckResult } from '@skillcat/core';
import { useI18n } from '@renderer/lib/i18n';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

/** Version + release-source display and the manual update check. */
export function UpdatesSection({
  appVersion,
  update,
  updateCheck,
  onOpenExternal,
}: {
  appVersion: string;
  update: UpdateCheckResult | null;
  updateCheck: { run: () => Promise<unknown>; pending: boolean };
  onOpenExternal: (url: string) => Promise<void>;
}): React.ReactElement {
  const { t } = useI18n();
  const releaseUrl = update?.url ?? null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted-foreground">
        {t('settings.updateVersion', { version: appVersion })}
      </span>
      {update?.repo ? (
        <span className="text-[11px] text-muted-foreground">
          {t('settings.updateSource')}{' '}
          <button
            type="button"
            className="focus-ring rounded-sm text-primary hover:underline"
            onClick={() => void onOpenExternal(`https://github.com/${update.repo}`)}
          >
            {update.repo}
          </button>
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void updateCheck.run()} disabled={updateCheck.pending}>
          {updateCheck.pending ? t('settings.updateChecking') : t('settings.updateCheck')}
        </Button>
        {update ? (
          !update.configured ? (
            <span className="text-[11px] text-muted-foreground">
              {t('settings.updateUnconfigured')}
            </span>
          ) : update.error ? (
            <Badge tone="error">{t('settings.updateFailed', { message: update.error })}</Badge>
          ) : update.hasUpdate ? (
            <Badge tone="warn">
              {t('settings.updateAvailable', { version: update.latest ?? '' })}
            </Badge>
          ) : update.latest ? (
            <Badge tone="success">{t('settings.updateLatest')}</Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {t('settings.updateNoRelease')}
            </span>
          )
        ) : null}
      </div>
      {releaseUrl ? (
        <div>
          <Button size="sm" onClick={() => void onOpenExternal(releaseUrl)}>
            {t('settings.updateOpen')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
