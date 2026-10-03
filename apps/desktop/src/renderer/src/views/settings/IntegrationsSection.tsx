import * as React from 'react';
import type { BridgeStatus } from '@skillcat/core';
import {
  ACTIVITY_PHRASE_MAX,
  ACTIVITY_PHRASE_MIN,
  ACTIVITY_RETENTION_MAX,
  ACTIVITY_RETENTION_MIN,
} from '@skillcat/core/activity';
import { useI18n } from '@renderer/lib/i18n';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import type { ActivityForm } from './types';

/** Agent bridge installs plus runtime-observation preferences. */
export function IntegrationsSection({
  bridges,
  bridgeBusy,
  onInstall,
  onUninstall,
  activity,
}: {
  bridges: BridgeStatus[];
  bridgeBusy: string | null;
  onInstall: (bridge: BridgeStatus) => void;
  onUninstall: (bridge: BridgeStatus) => void;
  activity: ActivityForm;
}): React.ReactElement {
  const { t } = useI18n();

  return (
    <>
      <h2 className="section-label">{t('settings.integrationsHeading')}</h2>
      <span className="text-[11px] text-muted-foreground">
        {t('settings.integrationsHint')}
      </span>
      <div className="flex flex-col gap-2">
        {bridges.map((bridge) => (
          <div
            key={bridge.id}
            className="flex flex-col gap-2 rounded-lg border border-border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{bridge.display}</span>
                <Badge tone={bridge.available ? 'success' : 'warn'}>
                  {bridge.available
                    ? t('settings.integration.detected')
                    : t('settings.integration.notDetected')}
                </Badge>
                <Badge tone={bridge.installed ? 'accent' : undefined}>
                  {bridge.installed
                    ? t('settings.integration.installed')
                    : t('settings.integration.notInstalled')}
                </Badge>
              </div>
              {bridge.installed ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bridgeBusy === bridge.id}
                  onClick={() => onUninstall(bridge)}
                >
                  {bridgeBusy === bridge.id
                    ? t('settings.integration.uninstalling')
                    : t('settings.integration.uninstall')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={bridgeBusy === bridge.id}
                  onClick={() => onInstall(bridge)}
                >
                  {bridgeBusy === bridge.id
                    ? t('settings.integration.installing')
                    : t('settings.integration.install')}
                </Button>
              )}
            </div>
            {bridge.targets[0] ? (
              <div className="font-mono text-[11px] break-all text-muted-foreground">
                {t('settings.integration.target', { path: bridge.targets[0] })}
              </div>
            ) : null}
            {bridge.installed ? (
              <div className="text-[11px] text-muted-foreground">
                {t('settings.integration.restartHint', { agent: bridge.display })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <h2 className="section-label mt-2">{t('settings.activityHeading')}</h2>
      <span className="text-[11px] text-muted-foreground">{t('settings.activityHint')}</span>
      <label className="flex items-center gap-2 text-muted-foreground">
        <Switch
          checked={activity.enabled}
          onCheckedChange={activity.setEnabled}
          aria-label={t('settings.activityEnable')}
        />
        {t('settings.activityEnable')}
      </label>
      <label className="flex items-center gap-2 text-muted-foreground">
        <Switch
          checked={activity.storePhrase}
          onCheckedChange={activity.setStorePhrase}
          disabled={!activity.enabled}
          aria-label={t('settings.activityStorePhrase')}
        />
        {t('settings.activityStorePhrase')}
      </label>
      <Field
        label={t('settings.activityRetention', {
          min: ACTIVITY_RETENTION_MIN,
          max: ACTIVITY_RETENTION_MAX,
        })}
      >
        <Input
          type="number"
          min={ACTIVITY_RETENTION_MIN}
          max={ACTIVITY_RETENTION_MAX}
          className="w-30"
          value={activity.retention}
          disabled={!activity.enabled}
          onChange={(event) => activity.setRetention(event.target.value)}
        />
      </Field>
      <Field
        label={t('settings.activityPhraseChars', {
          min: ACTIVITY_PHRASE_MIN,
          max: ACTIVITY_PHRASE_MAX,
        })}
      >
        <Input
          type="number"
          min={ACTIVITY_PHRASE_MIN}
          max={ACTIVITY_PHRASE_MAX}
          className="w-30"
          value={activity.phraseChars}
          disabled={!activity.enabled || !activity.storePhrase}
          onChange={(event) => activity.setPhraseChars(event.target.value)}
        />
      </Field>
    </>
  );
}
