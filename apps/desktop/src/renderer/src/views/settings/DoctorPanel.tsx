import * as React from 'react';
import type { DoctorReport } from '@skillcat/core';
import { useI18n } from '@renderer/lib/i18n';

/** Read-only rendering of a `doctor()` report. */
export function DoctorPanel({ doctor }: { doctor: DoctorReport | null }): React.ReactElement | null {
  const { t, formatMessage } = useI18n();
  if (!doctor) return null;
  return (
    <>
      <h2 className="section-label">{t('settings.doctorHeading')}</h2>
      <div className="flex flex-col gap-1">
        <div>
          {doctor.cli.version
            ? t('settings.doctorCliVersion', {
                command: doctor.cli.command?.join(' ') ?? '',
                version: doctor.cli.version,
              })
            : t('settings.doctorCli', {
                command: doctor.cli.command?.join(' ') ?? t('settings.doctorCliUnset'),
              })}
        </div>
        <div className="text-muted-foreground">
          {t('settings.doctorConfigDir', { path: doctor.configDir })}
        </div>
        {/* deslop-ignore-next-line 34: 日志路径是数据值 */}
        <div className="font-mono text-[11px] text-muted-foreground">
          {t('settings.doctorLogPath', { path: doctor.logPath })}
        </div>
        <div className="text-muted-foreground">
          {doctor.proxy
            ? t('settings.doctorProxy', { url: doctor.proxy })
            : t('settings.doctorProxyNone')}
        </div>
        {doctor.lockFiles.map((lock) => (
          <div
            key={lock.path}
            // deslop-ignore-next-line 34: 锁文件路径是数据值
            className="font-mono text-[11px] text-muted-foreground"
          >
            {lock.ok ? '✓' : '✗'} {lock.path}{' '}
            {lock.count !== undefined ? `(${lock.count})` : ''}
          </div>
        ))}
        {doctor.warnings.map((warning) => (
          <div key={warning.code} className="text-warning">
            {formatMessage(warning)}
          </div>
        ))}
      </div>
    </>
  );
}
