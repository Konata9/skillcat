import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { LlmProvider, LlmTestResult } from '@skillcat/core';
import { getLlmPreset, LLM_PROVIDERS } from '@skillcat/core/llm';
import { useI18n, type MessageKey } from '@renderer/lib/i18n';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';

const LLM_PROVIDER_LABEL: Record<LlmProvider, MessageKey> = {
  anthropic: 'settings.llmProvider.anthropic',
  openai: 'settings.llmProvider.openai',
  gemini: 'settings.llmProvider.gemini',
  deepseek: 'settings.llmProvider.deepseek',
  qwen: 'settings.llmProvider.qwen',
  glm: 'settings.llmProvider.glm',
  kimi: 'settings.llmProvider.kimi',
  minimax: 'settings.llmProvider.minimax',
  mimo: 'settings.llmProvider.mimo',
  ollama: 'settings.llmProvider.ollama',
  custom: 'settings.llmProvider.custom',
};

export interface LlmForm {
  enabled: boolean;
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  showApiKey: boolean;
  result: LlmTestResult | null;
  setEnabled: (value: boolean) => void;
  setApiKey: (value: string) => void;
  setBaseUrl: (value: string) => void;
  setModel: (value: string) => void;
  setShowApiKey: (value: boolean) => void;
  changeProvider: (provider: LlmProvider) => void;
}

/** LLM provider, credentials and connectivity test. */
export function LlmSection({
  form,
  test,
}: {
  form: LlmForm;
  test: { run: () => Promise<unknown>; pending: boolean };
}): React.ReactElement {
  const { t } = useI18n();
  const preset = getLlmPreset(form.provider);

  return (
    <Field label={t('settings.llmHeading')}>
      <span className="text-[11px] text-muted-foreground">{t('settings.llmHint')}</span>
      <div className="flex items-center gap-2">
        <Switch
          checked={form.enabled}
          onCheckedChange={form.setEnabled}
          aria-label={t('settings.llmEnable')}
        />
        <span className="text-muted-foreground">{t('settings.llmEnable')}</span>
      </div>
      {form.enabled ? (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t('settings.llmProviderLabel')}
            </span>
            <div className="flex items-center gap-2">
              <Select
                aria-label={t('settings.llmProviderLabel')}
                className="w-52"
                value={form.provider}
                onChange={(event) => form.changeProvider(event.target.value as LlmProvider)}
              >
                {LLM_PROVIDERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(LLM_PROVIDER_LABEL[item.id])}
                  </option>
                ))}
              </Select>
              {preset.requiresKey ? null : (
                <span className="text-[11px] text-muted-foreground">{t('settings.llmNoKey')}</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t('settings.llmApiKeyLabel')}
            </span>
            <div className="relative">
              <Input
                type={form.showApiKey ? 'text' : 'password'}
                autoComplete="off"
                className="pr-9"
                value={form.apiKey}
                onChange={(event) => form.setApiKey(event.target.value)}
                placeholder={preset.requiresKey ? 'sk-…' : t('settings.llmApiKeyOptional')}
              />
              <button
                type="button"
                onClick={() => form.setShowApiKey(!form.showApiKey)}
                aria-label={
                  form.showApiKey ? t('settings.llmApiKeyHide') : t('settings.llmApiKeyShow')
                }
                className="focus-ring absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
              >
                {form.showApiKey ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <span className="text-[11px] text-muted-foreground">{t('settings.llmKeyHint')}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t('settings.llmBaseUrlLabel')}
            </span>
            <Input
              value={form.baseUrl}
              onChange={(event) => form.setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t('settings.llmModelLabel')}
            </span>
            <Input
              value={form.model}
              onChange={(event) => form.setModel(event.target.value)}
              placeholder="gpt-4o"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void test.run()}
              disabled={test.pending || !form.baseUrl.trim() || !form.model.trim()}
            >
              {test.pending ? t('settings.llmTesting') : t('settings.llmTest')}
            </Button>
            {form.result ? (
              <Badge tone={form.result.ok ? 'success' : 'error'}>
                {form.result.ok
                  ? t('settings.llmTestOk', { model: form.model.trim() })
                  : t('settings.llmTestFail', { status: form.result.status ?? '—' })}
              </Badge>
            ) : null}
          </div>
          {form.result && !form.result.ok ? (
            <span className="font-mono text-[11px] break-all text-destructive">
              {form.result.message}
            </span>
          ) : null}
        </div>
      ) : null}
    </Field>
  );
}
