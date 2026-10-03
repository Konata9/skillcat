/**
 * Scanning settings: project roots, extra skill dirs and the similarity
 * thresholds that drive the local rule engine.
 */
import * as React from 'react';
import { CircleHelp } from 'lucide-react';
import { useI18n } from '@renderer/lib/i18n';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Tooltip } from '../../components/ui/tooltip';
import type { SettingsDraft, SettingsPatch } from './types';

export function ScanningSection({
  draft,
  patch,
  maxScanDepth,
  onPickDirectory,
}: {
  draft: SettingsDraft;
  patch: SettingsPatch;
  maxScanDepth: number;
  onPickDirectory: () => void;
}): React.ReactElement {
  const { t } = useI18n();

  return (
    <>
      <Field label={t('settings.rootsLabel')}>
        <Textarea
          rows={4}
          value={draft.roots}
          onChange={(event) => patch({ roots: event.target.value })}
          placeholder="~/Workspace"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onPickDirectory}>
            {t('settings.pickDirectory')}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {t('settings.rootsHint', { depth: maxScanDepth })}
          </span>
        </div>
      </Field>

      <Field label={t('settings.skillDirsLabel')}>
        <Textarea
          rows={3}
          value={draft.skillDirs}
          onChange={(event) => patch({ skillDirs: event.target.value })}
          placeholder={'.claude/skills\n~/.my-skills'}
        />
        <span className="text-[11px] text-muted-foreground">{t('settings.skillDirsHint')}</span>
      </Field>

      <Field
        label={
          <>
            {t('settings.overlapLabel')}
            <Tooltip
              triggerLabel={t('settings.overlapTooltipLabel')}
              content={t('settings.overlapTooltip')}
            >
              <CircleHelp className="size-3.5" aria-hidden="true" />
            </Tooltip>
          </>
        }
      >
        <Input
          type="number"
          min={0}
          max={1}
          step={0.05}
          className="w-30"
          value={draft.overlap}
          onChange={(event) => patch({ overlap: event.target.value })}
        />
      </Field>

      <Field
        label={
          <>
            {t('settings.duplicateLabel')}
            <Tooltip
              triggerLabel={t('settings.duplicateTooltipLabel')}
              content={t('settings.duplicateTooltip')}
            >
              <CircleHelp className="size-3.5" aria-hidden="true" />
            </Tooltip>
          </>
        }
      >
        <Input
          type="number"
          min={0}
          max={1}
          step={0.05}
          className="w-30"
          value={draft.duplicate}
          onChange={(event) => patch({ duplicate: event.target.value })}
        />
      </Field>
    </>
  );
}
