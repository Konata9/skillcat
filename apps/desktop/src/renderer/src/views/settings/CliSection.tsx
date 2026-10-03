/**
 * CLI settings: the `skills` command override, its resolution status, and the
 * on-demand `doctor()` diagnostic report.
 */
import * as React from 'react';
import { useState } from 'react';
import type { DoctorReport } from '@skillcat/core';
import { useI18n } from '@renderer/lib/i18n';
import { useAsyncAction } from '@renderer/hooks/useAsyncAction';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { DoctorPanel } from './DoctorPanel';
import type { SettingsDraft, SettingsPatch } from './types';

export function CliSection({
  cliAvailable,
  cliSource,
  cliError,
  draft,
  patch,
  onDoctor,
  onStatus,
}: {
  cliAvailable: boolean;
  cliSource: string;
  cliError?: string;
  draft: SettingsDraft;
  patch: SettingsPatch;
  onDoctor: () => Promise<DoctorReport>;
  onStatus: (message: string) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);

  const doctorCheck = useAsyncAction(async () => {
    const report = await onDoctor();
    setDoctor(report);
    onStatus(
      report.ok ? t('status.doctorOk') : t('status.doctorWarnings', { n: report.warnings.length }),
    );
  });

  return (
    <>
      <Field label={t('settings.commandLabel')}>
        <Input
          value={draft.command}
          onChange={(event) => patch({ command: event.target.value })}
          placeholder="npx -y skills"
        />
        <div className="flex items-center gap-2">
          <Badge tone={cliAvailable ? 'success' : 'error'}>
            {cliAvailable
              ? t('settings.cliAvailable', { source: cliSource })
              : t('settings.cliUnavailable')}
          </Badge>
          {cliError ? <span className="text-destructive">{cliError}</span> : null}
        </div>
      </Field>

      <div className="flex items-center gap-2">
        <Button onClick={() => void doctorCheck.run()} disabled={doctorCheck.pending}>
          {doctorCheck.pending ? t('settings.runningDoctor') : t('settings.runDoctor')}
        </Button>
      </div>

      <DoctorPanel doctor={doctor} />
    </>
  );
}
