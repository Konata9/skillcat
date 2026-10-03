import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import type {
  ActivitySettings,
  AppConfig,
  BridgeStatus,
  DoctorReport,
  LlmProvider,
  LlmSettings,
  LlmTestResult,
  UpdateCheckResult,
} from '@skillcat/core';
import {
  ACTIVITY_PHRASE_MAX,
  ACTIVITY_PHRASE_MIN,
  ACTIVITY_RETENTION_MAX,
  ACTIVITY_RETENTION_MIN,
} from '@skillcat/core/activity';
import { getLlmPreset } from '@skillcat/core/llm';
import { isValidProxyUrl, normalizeProxyUrl } from '@skillcat/core/proxy';
import { useAsyncAction } from '@renderer/hooks/useAsyncAction';
import { useReportError } from '@renderer/hooks/useReportError';
import { errorMessage } from '@renderer/lib/format';
import { useI18n, type Locale, type MessageKey } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { Tooltip } from '../components/ui/tooltip';
import { DoctorPanel } from './settings/DoctorPanel';
import { IntegrationsSection, type ActivityForm } from './settings/IntegrationsSection';
import { LlmSection, type LlmForm } from './settings/LlmSection';
import { UpdatesSection } from './settings/UpdatesSection';

export type SettingsCategory =
  | 'general'
  | 'scanning'
  | 'cli'
  | 'network'
  | 'llm'
  | 'integrations'
  | 'updates';

const CATEGORY_ORDER: SettingsCategory[] = [
  'general',
  'scanning',
  'cli',
  'network',
  'llm',
  'integrations',
  'updates',
];

const CATEGORY_LABEL: Record<SettingsCategory, MessageKey> = {
  general: 'settings.category.general',
  scanning: 'settings.category.scanning',
  cli: 'settings.category.cli',
  network: 'settings.category.network',
  llm: 'settings.category.llm',
  integrations: 'settings.category.integrations',
  updates: 'settings.category.updates',
};

export function SettingsView({
  config,
  configPath,
  appVersion,
  cliAvailable,
  cliSource,
  cliError,
  initialCategory = 'general',
  onSave,
  onStatus,
  onPickDirectory,
  onOpenConfig,
  onRevealConfig,
  onReloadConfig,
  onDoctor,
  onTestLlm,
  onCheckUpdate,
  onOpenExternal,
  onListBridges,
  onInstallBridge,
  onUninstallBridge,
}: {
  config: AppConfig;
  configPath: string;
  appVersion: string;
  cliAvailable: boolean;
  cliSource: string;
  cliError?: string;
  initialCategory?: SettingsCategory;
  onSave: (patch: {
    roots: string[];
    proxy: { url: string; bypass: string };
    thresholds: { overlap: number; duplicate: number };
    skillsCommand: string[] | null;
    showInternal: boolean;
    customSkillDirs: string[];
    llm: LlmSettings;
    activity: ActivitySettings;
  }) => Promise<boolean>;
  onStatus: (message: string) => void;
  onPickDirectory: () => Promise<string | null>;
  onOpenConfig: () => Promise<void>;
  onRevealConfig: () => void;
  onReloadConfig: () => Promise<void>;
  onDoctor: () => Promise<DoctorReport>;
  onTestLlm: (settings: LlmSettings) => Promise<LlmTestResult>;
  onCheckUpdate: () => Promise<UpdateCheckResult>;
  onOpenExternal: (url: string) => Promise<void>;
  onListBridges: () => Promise<BridgeStatus[]>;
  onInstallBridge: (id: string) => Promise<void>;
  onUninstallBridge: (id: string) => Promise<void>;
}): React.ReactElement {
  const { t, locale, setLocale } = useI18n();
  const reportError = useReportError(onStatus);
  const [category, setCategory] = useState<SettingsCategory>(initialCategory);
  const [roots, setRoots] = useState(config.roots.join('\n'));
  const [skillDirs, setSkillDirs] = useState(config.customSkillDirs.join('\n'));
  const [proxyEnabled, setProxyEnabled] = useState(Boolean(config.proxy.url));
  const [proxyUrl, setProxyUrl] = useState(config.proxy.url);
  const [proxyBypass, setProxyBypass] = useState(config.proxy.bypass);
  const [overlap, setOverlap] = useState(String(config.thresholds.overlap));
  const [duplicate, setDuplicate] = useState(String(config.thresholds.duplicate));
  const [command, setCommand] = useState(config.skillsCommand?.join(' ') ?? '');
  const [showInternal, setShowInternal] = useState(config.showInternal);
  const [llmEnabled, setLlmEnabled] = useState(config.llm.enabled);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(config.llm.provider);
  const [llmApiKey, setLlmApiKey] = useState(config.llm.apiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [llmBaseUrl, setLlmBaseUrl] = useState(config.llm.baseUrl);
  const [llmModel, setLlmModel] = useState(config.llm.model);
  const [llmResult, setLlmResult] = useState<LlmTestResult | null>(null);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [activityEnabled, setActivityEnabled] = useState(config.activity.enabled);
  const [activityStorePhrase, setActivityStorePhrase] = useState(config.activity.storePhrase);
  const [activityRetention, setActivityRetention] = useState(String(config.activity.retentionDays));
  const [activityPhraseChars, setActivityPhraseChars] = useState(
    String(config.activity.maxPhraseChars),
  );
  const [bridges, setBridges] = useState<BridgeStatus[]>([]);
  const [bridgeBusy, setBridgeBusy] = useState<string | null>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    if (dirty) return;
    setRoots(config.roots.join('\n'));
    setSkillDirs(config.customSkillDirs.join('\n'));
    setProxyEnabled(Boolean(config.proxy.url));
    if (config.proxy.url) {
      setProxyUrl(config.proxy.url);
      setProxyBypass(config.proxy.bypass);
    }
    setOverlap(String(config.thresholds.overlap));
    setDuplicate(String(config.thresholds.duplicate));
    setCommand(config.skillsCommand?.join(' ') ?? '');
    setShowInternal(config.showInternal);
    setLlmEnabled(config.llm.enabled);
    setLlmProvider(config.llm.provider);
    setLlmApiKey(config.llm.apiKey);
    setLlmBaseUrl(config.llm.baseUrl);
    setLlmModel(config.llm.model);
    setLlmResult(null);
    setActivityEnabled(config.activity.enabled);
    setActivityStorePhrase(config.activity.storePhrase);
    setActivityRetention(String(config.activity.retentionDays));
    setActivityPhraseChars(String(config.activity.maxPhraseChars));
  }, [config, dirty]);

  useEffect(() => {
    if (category !== 'integrations') return;
    void onListBridges().then(setBridges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    if (category === 'updates' && !updateRequested.current) {
      updateRequested.current = true;
      void updateCheck.run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const save = () => {
    const overlapValue = Number.parseFloat(overlap);
    const duplicateValue = Number.parseFloat(duplicate);
    const retentionValue = Number.parseInt(activityRetention, 10);
    const phraseValue = Number.parseInt(activityPhraseChars, 10);
    onSave({
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
      customSkillDirs: skillDirs
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      llm: {
        enabled: llmEnabled,
        provider: llmProvider,
        apiKey: llmApiKey.trim(),
        baseUrl: llmBaseUrl.trim(),
        model: llmModel.trim(),
      },
      activity: {
        enabled: activityEnabled,
        storePhrase: activityStorePhrase,
        retentionDays: Number.isFinite(retentionValue)
          ? Math.min(
              ACTIVITY_RETENTION_MAX,
              Math.max(ACTIVITY_RETENTION_MIN, retentionValue),
            )
          : config.activity.retentionDays,
        maxPhraseChars: Number.isFinite(phraseValue)
          ? Math.min(ACTIVITY_PHRASE_MAX, Math.max(ACTIVITY_PHRASE_MIN, phraseValue))
          : config.activity.maxPhraseChars,
      },
    })
      .then((ok) => {
        if (ok) setDirty(false);
      })
      .catch(() => {
        // Errors are surfaced by the caller's status message.
      });
  };

  const changeProvider = (provider: LlmProvider) => {
    setDirty(true);
    setLlmProvider(provider);
    const preset = getLlmPreset(provider);
    setLlmBaseUrl(preset.baseUrl);
    setLlmModel(preset.model);
    setLlmResult(null);
  };

  const llmTest = useAsyncAction(async () => {
    setLlmResult(null);
    setLlmResult(
      await onTestLlm({
        enabled: llmEnabled,
        provider: llmProvider,
        apiKey: llmApiKey.trim(),
        baseUrl: llmBaseUrl.trim(),
        model: llmModel.trim(),
      }),
    );
  });

  const updateCheck = useAsyncAction(async () => setUpdate(await onCheckUpdate()));

  const pickDirectory = async () => {
    const picked = await onPickDirectory();
    if (!picked) return;
    setDirty(true);
    setRoots((current) => (current.trim() ? `${current.trim()}\n${picked}` : picked));
  };

  const doctorCheck = useAsyncAction(async () => {
    const report = await onDoctor();
    setDoctor(report);
    onStatus(
      report.ok ? t('status.doctorOk') : t('status.doctorWarnings', { n: report.warnings.length }),
    );
  });

  const configReload = useAsyncAction(() => onReloadConfig());

  const reloadBridges = async () => {
    setBridges(await onListBridges());
  };

  const installBridge = async (bridge: BridgeStatus) => {
    setBridgeBusy(bridge.id);
    try {
      await onInstallBridge(bridge.id);
      await reloadBridges();
      onStatus(t('status.bridgeInstalled', { agent: bridge.display }));
    } catch (error) {
      reportError(error);
    } finally {
      setBridgeBusy(null);
    }
  };

  const uninstallBridge = async (bridge: BridgeStatus) => {
    setBridgeBusy(bridge.id);
    try {
      await onUninstallBridge(bridge.id);
      await reloadBridges();
      onStatus(t('status.bridgeUninstalled', { agent: bridge.display }));
    } catch (error) {
      const blocked = /not removed: (.+)$/.exec(errorMessage(error));
      if (blocked) onStatus(t('settings.integration.uninstallBlocked', { path: blocked[1] ?? '' }));
      else reportError(error);
    } finally {
      setBridgeBusy(null);
    }
  };

  const markDirty = () => setDirty(true);

  const activityForm: ActivityForm = {
    enabled: activityEnabled,
    storePhrase: activityStorePhrase,
    retention: activityRetention,
    phraseChars: activityPhraseChars,
    setEnabled: (value) => {
      markDirty();
      setActivityEnabled(value);
    },
    setStorePhrase: (value) => {
      markDirty();
      setActivityStorePhrase(value);
    },
    setRetention: (value) => {
      markDirty();
      setActivityRetention(value);
    },
    setPhraseChars: (value) => {
      markDirty();
      setActivityPhraseChars(value);
    },
  };

  const llmForm: LlmForm = {
    enabled: llmEnabled,
    provider: llmProvider,
    apiKey: llmApiKey,
    baseUrl: llmBaseUrl,
    model: llmModel,
    showApiKey,
    result: llmResult,
    setEnabled: (value) => {
      markDirty();
      setLlmEnabled(value);
    },
    setApiKey: (value) => {
      markDirty();
      setLlmApiKey(value);
    },
    setBaseUrl: (value) => {
      markDirty();
      setLlmBaseUrl(value);
    },
    setModel: (value) => {
      markDirty();
      setLlmModel(value);
    },
    setShowApiKey,
    changeProvider,
  };

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="flex w-40 shrink-0 flex-col gap-0.5 border-r border-border p-2">
        {CATEGORY_ORDER.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={cn(
              'focus-ring rounded-md px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              category === item && 'bg-primary/10 text-primary',
            )}
          >
            {t(CATEGORY_LABEL[item])}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex max-w-[720px] flex-col gap-4 px-4 pt-4 pb-8">
            {category === 'general' ? (
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
                    <span className="text-[11px] text-muted-foreground">
                      {t('settings.languageHint')}
                    </span>
                  </div>
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

                <Field label={t('settings.configFileLabel')}>
                  <div className="font-mono text-[11px] break-all text-muted-foreground">
                    {configPath}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => void onOpenConfig()}>
                      {t('settings.openConfig')}
                    </Button>
                    <Button size="sm" onClick={() => onRevealConfig()}>
                      {t('settings.revealConfig')}
                    </Button>
                    <Button size="sm" onClick={() => void configReload.run()} disabled={configReload.pending}>
                      {configReload.pending ? t('settings.reloadingConfig') : t('settings.reloadConfig')}
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      {t('settings.configFileHint')}
                    </span>
                  </div>
                </Field>
              </>
            ) : null}

            {category === 'scanning' ? (
              <>
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

                <Field label={t('settings.skillDirsLabel')}>
                  <Textarea
                    rows={3}
                    value={skillDirs}
                    onChange={(event) => {
                      setDirty(true);
                      setSkillDirs(event.target.value);
                    }}
                    placeholder={'.claude/skills\n~/.my-skills'}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {t('settings.skillDirsHint')}
                  </span>
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
                    value={overlap}
                    onChange={(event) => {
                      setDirty(true);
                      setOverlap(event.target.value);
                    }}
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
                    value={duplicate}
                    onChange={(event) => {
                      setDirty(true);
                      setDuplicate(event.target.value);
                    }}
                  />
                </Field>
              </>
            ) : null}

            {category === 'cli' ? (
              <>
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

                <div className="flex items-center gap-2">
                  <Button onClick={() => void doctorCheck.run()} disabled={doctorCheck.pending}>
                    {doctorCheck.pending ? t('settings.runningDoctor') : t('settings.runDoctor')}
                  </Button>
                </div>

                <DoctorPanel doctor={doctor} />
              </>
            ) : null}

            {category === 'network' ? (
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
                      <span className="text-[11px] text-muted-foreground">
                        {t('settings.proxyHint')}
                      </span>
                      {proxyUrl.trim() && !isValidProxyUrl(proxyUrl) ? (
                        <span className="text-warning">{t('settings.proxyInvalid')}</span>
                      ) : proxyUrl.trim() ? (
                        <span className="text-success">
                          {t('settings.proxyActive', {
                            url: normalizeProxyUrl(proxyUrl) ?? proxyUrl,
                          })}
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
            ) : null}

            {category === 'llm' ? <LlmSection form={llmForm} test={llmTest} /> : null}

            {category === 'integrations' ? (
              <IntegrationsSection
                bridges={bridges}
                bridgeBusy={bridgeBusy}
                onInstall={installBridge}
                onUninstall={uninstallBridge}
                activity={activityForm}
              />
            ) : null}

            {category === 'updates' ? (
              <UpdatesSection
                appVersion={appVersion}
                update={update}
                updateCheck={updateCheck}
                onOpenExternal={onOpenExternal}
              />
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2.5">
          <Button variant="primary" onClick={save} disabled={!dirty}>
            {t('settings.save')}
          </Button>
          {dirty ? (
            <span className="text-[11px] text-muted-foreground">{t('settings.unsaved')}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
