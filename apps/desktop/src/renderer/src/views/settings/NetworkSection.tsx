/**
 * Network settings: the optional HTTP/SOCKS proxy applied to CLI child
 * processes and the in-process fetch, plus its bypass list.
 */
import * as React from 'react';
import { isValidProxyUrl, normalizeProxyUrl } from '@skillcat/core/proxy';
import { useI18n } from '@renderer/lib/i18n';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import type { SettingsDraft, SettingsPatch } from './types';

export function NetworkSection({
  draft,
  patch,
}: {
  draft: SettingsDraft;
  patch: SettingsPatch;
}): React.ReactElement {
  const { t } = useI18n();

  return (
    <Field label={t('settings.proxyLabel')}>
      <div className="flex items-center gap-2">
        <Switch
          checked={draft.proxyEnabled}
          onCheckedChange={(enabled) => patch({ proxyEnabled: enabled })}
          aria-label={t('settings.proxyEnable')}
        />
        <span className="text-muted-foreground">{t('settings.proxyEnable')}</span>
      </div>
      {draft.proxyEnabled ? (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t('settings.proxyUrlLabel')}
            </span>
            <Input
              value={draft.proxyUrl}
              onChange={(event) => patch({ proxyUrl: event.target.value })}
              placeholder="127.0.0.1:7890"
            />
            <span className="text-[11px] text-muted-foreground">{t('settings.proxyHint')}</span>
            {draft.proxyUrl.trim() && !isValidProxyUrl(draft.proxyUrl) ? (
              <span className="text-warning">{t('settings.proxyInvalid')}</span>
            ) : draft.proxyUrl.trim() ? (
              <span className="text-success">
                {t('settings.proxyActive', {
                  url: normalizeProxyUrl(draft.proxyUrl) ?? draft.proxyUrl,
                })}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t('settings.proxyBypassLabel')}
            </span>
            <Input
              value={draft.proxyBypass}
              onChange={(event) => patch({ proxyBypass: event.target.value })}
              placeholder="localhost, 127.0.0.1, .internal"
            />
          </div>
        </div>
      ) : null}
    </Field>
  );
}
