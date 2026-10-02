/**
 * Wraps an error into the standard `status.opFailed` toast so callers do not
 * repeat the same template at every async boundary.
 */
import { useCallback } from 'react';
import { errorMessage } from '@renderer/lib/format';
import { useI18n } from '@renderer/lib/i18n';

export function useReportError(report: (message: string) => void): (error: unknown) => void {
  const { t } = useI18n();
  return useCallback(
    (error: unknown) => report(t('status.opFailed', { message: errorMessage(error) })),
    [report, t],
  );
}
