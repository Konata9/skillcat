/**
 * Wraps an error into the standard `status.opFailed` toast so callers do not
 * repeat the same template at every async boundary, and mirrors it to the
 * diagnostic log.
 */
import { useCallback } from 'react';
import log from 'electron-log/renderer';
import { errorMessage } from '@renderer/lib/format';
import { useI18n } from '@renderer/lib/i18n';

export function useReportError(report: (message: string) => void): (error: unknown) => void {
  const { t } = useI18n();
  return useCallback(
    (error: unknown) => {
      const message = errorMessage(error);
      log.error('ui action failed', message);
      report(t('status.opFailed', { message }));
    },
    [report, t],
  );
}
