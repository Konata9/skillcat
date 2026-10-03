/**
 * Settings form model: owns the editable draft, the dirty flag, the
 * config→draft sync and the save serialization/clamping. Extracted from
 * `SettingsView` so the view is a thin shell and each section reads from one
 * shared model instead of ~30 ad-hoc `useState`s.
 *
 * Numeric inputs stay as strings in the draft and are parsed/clamped only on
 * save, so a half-typed value never round-trips through `Number`.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ACTIVITY_PHRASE_MAX,
  ACTIVITY_PHRASE_MIN,
  ACTIVITY_RETENTION_MAX,
  ACTIVITY_RETENTION_MIN,
} from '@skillcat/core/activity';
import { getLlmPreset } from '@skillcat/core/llm';
import { LOG_SIZE_MAX_MB, LOG_SIZE_MIN_MB } from '@skillcat/core/logging';
import type { AppConfig, LlmProvider, LlmTestResult } from '@skillcat/core';
import type {
  ActivityForm,
  LlmForm,
  LoggingForm,
  SettingsDraft,
  SettingsPatch,
  SettingsSavePatch,
} from '@renderer/views/settings/types';

function createSettingsDraft(config: AppConfig): SettingsDraft {
  return {
    roots: config.roots.join('\n'),
    skillDirs: config.customSkillDirs.join('\n'),
    proxyEnabled: Boolean(config.proxy.url),
    proxyUrl: config.proxy.url,
    proxyBypass: config.proxy.bypass,
    overlap: String(config.thresholds.overlap),
    duplicate: String(config.thresholds.duplicate),
    command: config.skillsCommand?.join(' ') ?? '',
    showInternal: config.showInternal,
    llmEnabled: config.llm.enabled,
    llmProvider: config.llm.provider,
    llmApiKey: config.llm.apiKey,
    llmBaseUrl: config.llm.baseUrl,
    llmModel: config.llm.model,
    activityEnabled: config.activity.enabled,
    activityStorePhrase: config.activity.storePhrase,
    activityRetention: String(config.activity.retentionDays),
    activityPhraseChars: String(config.activity.maxPhraseChars),
    loggingEnabled: config.logging.enabled,
    loggingLevel: config.logging.level,
    loggingSize: String(config.logging.maxTotalMb),
  };
}

export interface SettingsDraftController {
  draft: SettingsDraft;
  patch: SettingsPatch;
  dirty: boolean;
  save: () => Promise<void>;
  showApiKey: boolean;
  setShowApiKey: (value: boolean) => void;
  llmResult: LlmTestResult | null;
  setLlmResult: (value: LlmTestResult | null) => void;
  changeProvider: (provider: LlmProvider) => void;
  appendRoot: (root: string) => void;
  llmForm: LlmForm;
  activityForm: ActivityForm;
  loggingForm: LoggingForm;
}

export function useSettingsDraft(
  config: AppConfig,
  onSave: (patch: SettingsSavePatch) => Promise<boolean>,
): SettingsDraftController {
  const [draft, setDraft] = useState<SettingsDraft>(() => createSettingsDraft(config));
  const [dirty, setDirty] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [llmResult, setLlmResult] = useState<LlmTestResult | null>(null);

  // Re-sync from disk while the form is clean; a dirty form is never clobbered.
  useEffect(() => {
    if (dirty) return;
    setDraft(createSettingsDraft(config));
    setLlmResult(null);
  }, [config, dirty]);

  const patch = useCallback<SettingsPatch>((partial) => {
    setDirty(true);
    setDraft((current) => ({ ...current, ...partial }));
  }, []);

  const changeProvider = useCallback((provider: LlmProvider) => {
    const preset = getLlmPreset(provider);
    setDirty(true);
    setDraft((current) => ({
      ...current,
      llmProvider: provider,
      llmBaseUrl: preset.baseUrl,
      llmModel: preset.model,
    }));
    setLlmResult(null);
  }, []);

  const appendRoot = useCallback((root: string) => {
    setDirty(true);
    setDraft((current) => ({
      ...current,
      roots: current.roots.trim() ? `${current.roots.trim()}\n${root}` : root,
    }));
  }, []);

  const save = useCallback(async () => {
    const overlapValue = Number.parseFloat(draft.overlap);
    const duplicateValue = Number.parseFloat(draft.duplicate);
    const retentionValue = Number.parseInt(draft.activityRetention, 10);
    const phraseValue = Number.parseInt(draft.activityPhraseChars, 10);
    const loggingSizeValue = Number.parseInt(draft.loggingSize, 10);
    try {
      const ok = await onSave({
        roots: draft.roots
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        proxy: draft.proxyEnabled
          ? { url: draft.proxyUrl.trim(), bypass: draft.proxyBypass.trim() }
          : { url: '', bypass: '' },
        thresholds: {
          overlap: Number.isFinite(overlapValue) ? overlapValue : config.thresholds.overlap,
          duplicate: Number.isFinite(duplicateValue) ? duplicateValue : config.thresholds.duplicate,
        },
        skillsCommand: draft.command.trim() ? draft.command.trim().split(/\s+/) : null,
        showInternal: draft.showInternal,
        customSkillDirs: draft.skillDirs
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        llm: {
          enabled: draft.llmEnabled,
          provider: draft.llmProvider,
          apiKey: draft.llmApiKey.trim(),
          baseUrl: draft.llmBaseUrl.trim(),
          model: draft.llmModel.trim(),
        },
        activity: {
          enabled: draft.activityEnabled,
          storePhrase: draft.activityStorePhrase,
          retentionDays: Number.isFinite(retentionValue)
            ? Math.min(ACTIVITY_RETENTION_MAX, Math.max(ACTIVITY_RETENTION_MIN, retentionValue))
            : config.activity.retentionDays,
          maxPhraseChars: Number.isFinite(phraseValue)
            ? Math.min(ACTIVITY_PHRASE_MAX, Math.max(ACTIVITY_PHRASE_MIN, phraseValue))
            : config.activity.maxPhraseChars,
        },
        logging: {
          enabled: draft.loggingEnabled,
          level: draft.loggingLevel,
          maxTotalMb: Number.isFinite(loggingSizeValue)
            ? Math.min(LOG_SIZE_MAX_MB, Math.max(LOG_SIZE_MIN_MB, loggingSizeValue))
            : config.logging.maxTotalMb,
        },
      });
      if (ok) setDirty(false);
    } catch {
      // Errors are surfaced by the caller's status message.
    }
  }, [draft, config, onSave]);

  const llmForm: LlmForm = {
    enabled: draft.llmEnabled,
    provider: draft.llmProvider,
    apiKey: draft.llmApiKey,
    baseUrl: draft.llmBaseUrl,
    model: draft.llmModel,
    showApiKey,
    result: llmResult,
    setEnabled: (value) => patch({ llmEnabled: value }),
    setApiKey: (value) => patch({ llmApiKey: value }),
    setBaseUrl: (value) => patch({ llmBaseUrl: value }),
    setModel: (value) => patch({ llmModel: value }),
    setShowApiKey,
    changeProvider,
  };

  const activityForm: ActivityForm = {
    enabled: draft.activityEnabled,
    storePhrase: draft.activityStorePhrase,
    retention: draft.activityRetention,
    phraseChars: draft.activityPhraseChars,
    setEnabled: (value) => patch({ activityEnabled: value }),
    setStorePhrase: (value) => patch({ activityStorePhrase: value }),
    setRetention: (value) => patch({ activityRetention: value }),
    setPhraseChars: (value) => patch({ activityPhraseChars: value }),
  };

  const loggingForm: LoggingForm = {
    enabled: draft.loggingEnabled,
    level: draft.loggingLevel,
    maxTotalMb: draft.loggingSize,
    setEnabled: (value) => patch({ loggingEnabled: value }),
    setLevel: (value) => patch({ loggingLevel: value }),
    setMaxTotalMb: (value) => patch({ loggingSize: value }),
  };

  return {
    draft,
    patch,
    dirty,
    save,
    showApiKey,
    setShowApiKey,
    llmResult,
    setLlmResult,
    changeProvider,
    appendRoot,
    llmForm,
    activityForm,
    loggingForm,
  };
}
