/**
 * Settings shell: category navigation, the shared settings form model and the
 * save bar. Each category renders a dedicated section component; the form
 * state and save serialization live in `useSettingsDraft`.
 */
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import type {
  AppConfig,
  BridgeStatus,
  DoctorReport,
  LlmSettings,
  LlmTestResult,
  UpdateCheckResult,
} from '@skillcat/core';
import { useAsyncAction } from '@renderer/hooks/useAsyncAction';
import { useSettingsDraft } from '@renderer/hooks/useSettingsDraft';
import { useReportError } from '@renderer/hooks/useReportError';
import { useI18n, type MessageKey } from '@renderer/lib/i18n';
import { errorMessage } from '@renderer/lib/format';
import { cn } from '@renderer/lib/utils';
import { Button } from '../components/ui/button';
import { CliSection } from './settings/CliSection';
import { GeneralSection } from './settings/GeneralSection';
import { IntegrationsSection } from './settings/IntegrationsSection';
import { LlmSection } from './settings/LlmSection';
import { LoggingSection } from './settings/LoggingSection';
import { NetworkSection } from './settings/NetworkSection';
import { ScanningSection } from './settings/ScanningSection';
import { UpdatesSection } from './settings/UpdatesSection';
import type { SettingsCategory, SettingsSavePatch } from './settings/types';

export type { SettingsCategory };

const CATEGORY_ORDER: SettingsCategory[] = [
  'general',
  'scanning',
  'cli',
  'network',
  'llm',
  'integrations',
  'logging',
  'updates',
];

const CATEGORY_LABEL: Record<SettingsCategory, MessageKey> = {
  general: 'settings.category.general',
  scanning: 'settings.category.scanning',
  cli: 'settings.category.cli',
  network: 'settings.category.network',
  llm: 'settings.category.llm',
  integrations: 'settings.category.integrations',
  logging: 'settings.category.logging',
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
  onRevealLogs,
  onClearLogs,
}: {
  config: AppConfig;
  configPath: string;
  appVersion: string;
  cliAvailable: boolean;
  cliSource: string;
  cliError?: string;
  initialCategory?: SettingsCategory;
  onSave: (patch: SettingsSavePatch) => Promise<boolean>;
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
  onRevealLogs: () => Promise<void>;
  onClearLogs: () => Promise<void>;
}): React.ReactElement {
  const { t } = useI18n();
  const reportError = useReportError(onStatus);
  const [category, setCategory] = useState<SettingsCategory>(initialCategory);
  const [bridges, setBridges] = useState<BridgeStatus[]>([]);
  const [bridgeBusy, setBridgeBusy] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const updateRequested = useRef(false);

  const {
    draft,
    patch,
    dirty,
    save,
    setLlmResult,
    appendRoot,
    llmForm,
    activityForm,
    loggingForm,
  } = useSettingsDraft(config, onSave);

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

  const llmTest = useAsyncAction(async () => {
    setLlmResult(null);
    setLlmResult(
      await onTestLlm({
        enabled: draft.llmEnabled,
        provider: draft.llmProvider,
        apiKey: draft.llmApiKey.trim(),
        baseUrl: draft.llmBaseUrl.trim(),
        model: draft.llmModel.trim(),
      }),
    );
  });

  const updateCheck = useAsyncAction(async () => setUpdate(await onCheckUpdate()));

  const pickDirectory = async () => {
    const picked = await onPickDirectory();
    if (picked) appendRoot(picked);
  };

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
              <GeneralSection
                configPath={configPath}
                onOpenConfig={() => void onOpenConfig()}
                onRevealConfig={onRevealConfig}
                onReloadConfig={onReloadConfig}
                draft={draft}
                patch={patch}
              />
            ) : null}

            {category === 'scanning' ? (
              <ScanningSection
                draft={draft}
                patch={patch}
                maxScanDepth={config.maxScanDepth}
                onPickDirectory={() => void pickDirectory()}
              />
            ) : null}

            {category === 'cli' ? (
              <CliSection
                cliAvailable={cliAvailable}
                cliSource={cliSource}
                cliError={cliError}
                draft={draft}
                patch={patch}
                onDoctor={onDoctor}
                onStatus={onStatus}
              />
            ) : null}

            {category === 'network' ? <NetworkSection draft={draft} patch={patch} /> : null}

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

            {category === 'logging' ? (
              <LoggingSection
                form={loggingForm}
                logDir={`${configPath.replace(/[\\/][^\\/]*$/, '')}/logs`}
                onReveal={onRevealLogs}
                onClear={() =>
                  onClearLogs()
                    .then(() => onStatus(t('settings.loggingCleared')))
                    .catch(reportError)
                }
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
          <Button variant="primary" onClick={() => void save()} disabled={!dirty}>
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
