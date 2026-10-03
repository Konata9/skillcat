/**
 * General settings: UI language, internal-skill visibility and the config-file
 * actions (open / reveal / reload). Reads from the shared settings draft.
 */
import * as React from 'react';
import { useI18n, type Locale } from '@renderer/lib/i18n';
import { useAsyncAction } from '@renderer/hooks/useAsyncAction';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Select } from '../../components/ui/select';
import type { SettingsDraft, SettingsPatch } from './types';

export function GeneralSection({
  configPath,
  onOpenConfig,
  onRevealConfig,
  onReloadConfig,
  draft,
  patch,
}: {
  configPath: string;
  onOpenConfig: () => void;
  onRevealConfig: () => void;
  onReloadConfig: () => Promise<void>;
  draft: SettingsDraft;
  patch: SettingsPatch;
}): React.ReactElement {
  const { t, locale, setLocale } = useI18n();
  const configReload = useAsyncAction(onReloadConfig);

  return (
    <>
      <Field label={t('settings.languageLabel')}>
        <div className="flex items-center gap-2">
          <Select
            aria-label={t('settings.languageLabel')}
            className="w-40"
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </Select>
          <span className="text-[11px] text-muted-foreground">{t('settings.languageHint')}</span>
        </div>
      </Field>

      <label className="flex items-center gap-2 text-muted-foreground">
        <input
          type="checkbox"
          className="size-3.5 accent-primary"
          checked={draft.showInternal}
          onChange={(event) => patch({ showInternal: event.target.checked })}
        />
        {t('settings.showInternal')}
      </label>

      <Field label={t('settings.configFileLabel')}>
        <div className="font-mono text-[11px] break-all text-muted-foreground">{configPath}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onOpenConfig}>
            {t('settings.openConfig')}
          </Button>
          <Button size="sm" onClick={onRevealConfig}>
            {t('settings.revealConfig')}
          </Button>
          <Button
            size="sm"
            onClick={() => void configReload.run()}
            disabled={configReload.pending}
          >
            {configReload.pending ? t('settings.reloadingConfig') : t('settings.reloadConfig')}
          </Button>
          <span className="text-[11px] text-muted-foreground">{t('settings.configFileHint')}</span>
        </div>
      </Field>
    </>
  );
}
