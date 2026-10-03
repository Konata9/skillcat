import * as React from 'react';
import type { LogLevel } from '@skillcat/core';
import { LOG_LEVELS, LOG_SIZE_MAX_MB, LOG_SIZE_MIN_MB } from '@skillcat/core/logging';
import { useI18n } from '@renderer/lib/i18n';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';

export interface LoggingForm {
  enabled: boolean;
  level: LogLevel;
  maxTotalMb: string;
  setEnabled: (value: boolean) => void;
  setLevel: (value: LogLevel) => void;
  setMaxTotalMb: (value: string) => void;
}

/** Diagnostic log preferences: enable, level, size budget, reveal and clear. */
export function LoggingSection({
  form,
  logDir,
  onReveal,
  onClear,
}: {
  form: LoggingForm;
  logDir: string;
  onReveal: () => Promise<void>;
  onClear: () => Promise<void>;
}): React.ReactElement {
  const { t } = useI18n();
  const [confirming, setConfirming] = React.useState(false);

  return (
    <>
      <Field label={t('settings.loggingHeading')}>
        <span className="text-[11px] text-muted-foreground">{t('settings.loggingHint')}</span>
      </Field>

      <label className="flex items-center gap-2 text-muted-foreground">
        <Switch
          checked={form.enabled}
          onCheckedChange={form.setEnabled}
          aria-label={t('settings.loggingEnable')}
        />
        {t('settings.loggingEnable')}
      </label>

      <Field label={t('settings.loggingLevelLabel')}>
        <Select
          className="w-40"
          value={form.level}
          disabled={!form.enabled}
          onChange={(event) => form.setLevel(event.target.value as LogLevel)}
          aria-label={t('settings.loggingLevelLabel')}
        >
          {LOG_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('settings.loggingSizeLabel')}>
        <Input
          type="number"
          min={LOG_SIZE_MIN_MB}
          max={LOG_SIZE_MAX_MB}
          className="w-30"
          value={form.maxTotalMb}
          disabled={!form.enabled}
          onChange={(event) => form.setMaxTotalMb(event.target.value)}
        />
        <span className="text-[11px] text-muted-foreground">
          {t('settings.loggingSizeHint', { min: LOG_SIZE_MIN_MB, max: LOG_SIZE_MAX_MB })}
        </span>
      </Field>

      <Field label={t('settings.loggingDirLabel')}>
        <div className="font-mono text-[11px] break-all text-muted-foreground">{logDir}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void onReveal()}>
            {t('settings.loggingReveal')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            {t('settings.loggingClear')}
          </Button>
        </div>
      </Field>

      {confirming ? (
        <ConfirmDialog
          title={t('settings.loggingClearTitle')}
          confirmLabel={t('settings.loggingClear')}
          danger
          onConfirm={() => {
            setConfirming(false);
            void onClear();
          }}
          onClose={() => setConfirming(false)}
        >
          <p className="text-muted-foreground">{t('settings.loggingClearBody')}</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
