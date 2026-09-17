import * as React from 'react';
import { useEffect, useState } from 'react';
import type { AppConfig, DoctorReport } from '@skillman/core';
import { isValidProxyUrl, normalizeProxyUrl } from '@skillman/core/proxy';
import { useI18n, type Locale } from '@renderer/lib/i18n';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function SettingsView({
  config,
  cliAvailable,
  cliSource,
  cliError,
  onSave,
  onStatus,
  onPickDirectory,
  onDoctor,
}: {
  config: AppConfig;
  cliAvailable: boolean;
  cliSource: string;
  cliError?: string;
  onSave: (patch: {
    roots: string[];
    proxy: { url: string; bypass: string };
    thresholds: { overlap: number; duplicate: number };
    skillsCommand: string[] | null;
    showInternal: boolean;
  }) => Promise<void>;
  onStatus: (message: string) => void;
  onPickDirectory: () => Promise<string | null>;
  onDoctor: () => Promise<DoctorReport>;
}): React.ReactElement {
  const { t, formatMessage, locale, setLocale } = useI18n();
  const [roots, setRoots] = useState(config.roots.join('\n'));
  const [proxyEnabled, setProxyEnabled] = useState(Boolean(config.proxy.url));
  const [proxyUrl, setProxyUrl] = useState(config.proxy.url);
  const [proxyBypass, setProxyBypass] = useState(config.proxy.bypass);
  const [overlap, setOverlap] = useState(String(config.thresholds.overlap));
  const [duplicate, setDuplicate] = useState(String(config.thresholds.duplicate));
  const [command, setCommand] = useState(config.skillsCommand?.join(' ') ?? '');
  const [showInternal, setShowInternal] = useState(config.showInternal);
  const [dirty, setDirty] = useState(false);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setRoots(config.roots.join('\n'));
    setProxyEnabled(Boolean(config.proxy.url));
    if (config.proxy.url) {
      setProxyUrl(config.proxy.url);
      setProxyBypass(config.proxy.bypass);
    }
    setOverlap(String(config.thresholds.overlap));
    setDuplicate(String(config.thresholds.duplicate));
    setCommand(config.skillsCommand?.join(' ') ?? '');
    setShowInternal(config.showInternal);
  }, [config, dirty]);

  const save = () => {
    const overlapValue = Number.parseFloat(overlap);
    const duplicateValue = Number.parseFloat(duplicate);
    void onSave({
      roots: roots
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      proxy: proxyEnabled
        ? { url: proxyUrl.trim(), bypass: proxyBypass.trim() }
        : { url: '', bypass: '' },
      thresholds: {
        overlap: Number.isFinite(overlapValue) ? overlapValue : config.thresholds.overlap,
        duplicate: Number.isFinite(duplicateValue) ? duplicateValue : config.thresholds.duplicate,
      },
      skillsCommand: command.trim() ? command.trim().split(/\s+/) : null,
      showInternal,
    }).then(() => setDirty(false));
  };

  const pickDirectory = async () => {
    const picked = await onPickDirectory();
    if (!picked) return;
    setDirty(true);
    setRoots((current) => (current.trim() ? `${current.trim()}\n${picked}` : picked));
  };

  const runDoctor = async () => {
    setDoctorLoading(true);
    try {
      const report = await onDoctor();
      setDoctor(report);
      onStatus(
        report.ok
          ? t('status.doctorOk')
          : t('status.doctorWarnings', { n: report.warnings.length }),
      );
    } finally {
      setDoctorLoading(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex max-w-[720px] flex-col gap-4 px-4 pt-4 pb-10">
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

        <Field label={t('settings.rootsLabel')}>
          <Textarea
            rows={4}
            value={roots}
            onChange={(event) => {
              setDirty(true);
              setRoots(event.target.value);
            }}
            placeholder="~/Workspace"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void pickDirectory()}>
              {t('settings.pickDirectory')}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {t('settings.rootsHint', { depth: config.maxScanDepth })}
            </span>
          </div>
        </Field>

        <Field label={t('settings.overlapLabel')}>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            className="w-30"
            value={overlap}
            onChange={(event) => {
              setDirty(true);
              setOverlap(event.target.value);
            }}
          />
        </Field>

        <Field label={t('settings.duplicateLabel')}>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            className="w-30"
            value={duplicate}
            onChange={(event) => {
              setDirty(true);
              setDuplicate(event.target.value);
            }}
          />
        </Field>

        <Field label={t('settings.commandLabel')}>
          <Input
            value={command}
            onChange={(event) => {
              setDirty(true);
              setCommand(event.target.value);
            }}
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

        <Field label={t('settings.proxyLabel')}>
          <div className="flex items-center gap-2">
            <Switch
              checked={proxyEnabled}
              onCheckedChange={(enabled) => {
                setDirty(true);
                setProxyEnabled(enabled);
              }}
              aria-label={t('settings.proxyEnable')}
            />
            <span className="text-muted-foreground">{t('settings.proxyEnable')}</span>
          </div>
          {proxyEnabled ? (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t('settings.proxyUrlLabel')}
                </span>
                <Input
                  value={proxyUrl}
                  onChange={(event) => {
                    setDirty(true);
                    setProxyUrl(event.target.value);
                  }}
                  placeholder="127.0.0.1:7890"
                />
                <span className="text-[11px] text-muted-foreground">{t('settings.proxyHint')}</span>
                {proxyUrl.trim() && !isValidProxyUrl(proxyUrl) ? (
                  <span className="text-warning">{t('settings.proxyInvalid')}</span>
                ) : proxyUrl.trim() ? (
                  <span className="text-success">
                    {t('settings.proxyActive', { url: normalizeProxyUrl(proxyUrl) ?? proxyUrl })}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {t('settings.proxyBypassLabel')}
                </span>
                <Input
                  value={proxyBypass}
                  onChange={(event) => {
                    setDirty(true);
                    setProxyBypass(event.target.value);
                  }}
                  placeholder="localhost, 127.0.0.1, .internal"
                />
              </div>
            </div>
          ) : null}
        </Field>

        <label className="flex items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={showInternal}
            onChange={(event) => {
              setDirty(true);
              setShowInternal(event.target.checked);
            }}
          />
          {t('settings.showInternal')}
        </label>

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} disabled={!dirty}>
            {t('settings.save')}
          </Button>
          <Button onClick={() => void runDoctor()} disabled={doctorLoading}>
            {doctorLoading ? t('settings.runningDoctor') : t('settings.runDoctor')}
          </Button>
        </div>

        {doctor ? (
          <>
            <h2 className="section-label">{t('settings.doctorHeading')}</h2>
            <div className="flex flex-col gap-1 ">
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
                  {lock.ok ? '✓' : '✗'} {lock.path} {lock.count !== undefined ? `(${lock.count})` : ''}
                </div>
              ))}
              {doctor.warnings.map((warning) => (
                <div key={warning.code} className="text-warning">
                  {formatMessage(warning)}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
