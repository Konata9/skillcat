import * as React from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type {
  DoctorWarning,
  DoctorWarningCode,
  FindingCode,
  FindingMessage,
  FindingParam,
} from '@skillcat/core';
import { en } from './messages.en';
import { zh, type MessageKey } from './messages.zh';
import type { Locale, MessageParams, MessageValue } from './types';

// Compile-time guarantees that every core message code has a translation entry.
type AssertFindingCodesCovered = FindingCode extends MessageKey ? true : never;
type AssertDoctorCodesCovered = DoctorWarningCode extends MessageKey ? true : never;
const findingCodesCovered: AssertFindingCodesCovered = true;
const doctorCodesCovered: AssertDoctorCodesCovered = true;
void findingCodesCovered;
void doctorCodesCovered;

const STORAGE_KEY = 'skillcat-locale';
const LEGACY_STORAGE_KEY = 'skillman-locale';

const catalogs: Record<Locale, Record<MessageKey, MessageValue>> = { zh, en };

function detectLocale(): Locale {
  try {
    const stored =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    // storage unavailable: fall through to system detection
  }
  const language = typeof navigator === 'undefined' ? 'en' : (navigator.language ?? 'en');
  return language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

function selectPlural(
  value: { one: string; other: string },
  count: number,
  locale: Locale,
): string {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale === 'zh' ? 'zh-CN' : 'en-US');
    pluralRules.set(locale, rules);
  }
  return rules.select(count) === 'one' ? value.one : value.other;
}

function formatParam(value: FindingParam, locale: Locale): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatParam(item, locale)).join(locale === 'zh' ? '、' : ', ');
  }
  return formatMessageIn(locale, value);
}

function interpolate(template: string, params: MessageParams, locale: Locale): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) return `{${key}}`;
    return formatParam(value, locale);
  });
}

function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  const value = catalogs[locale][key];
  // Missing translations should never blank the UI; fall back to the key.
  if (value === undefined) return key;
  const template =
    typeof value === 'string' ? value : selectPlural(value, Number(params.n ?? 0), locale);
  return interpolate(template, params, locale);
}

function formatMessageIn(
  locale: Locale,
  message: FindingMessage | DoctorWarning,
): string {
  return translate(locale, message.code as MessageKey, (message.params ?? {}) as MessageParams);
}

function relativeTimeIn(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return translate(locale, 'time.unknown');
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return translate(locale, 'time.unknown');
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return translate(locale, 'time.justNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return translate(locale, 'time.minutesAgo', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return translate(locale, 'time.hoursAgo', { n: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return translate(locale, 'time.daysAgo', { n: days });
  const months = Math.round(days / 30);
  if (months < 12) return translate(locale, 'time.monthsAgo', { n: months });
  return translate(locale, 'time.yearsAgo', { n: Math.round(months / 12) });
}

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: MessageKey, params?: MessageParams) => string;
  formatMessage: (message: FindingMessage | DoctorWarning) => string;
  relativeTime: (iso: string | null | undefined) => string;
  scopeLabel: (scope: 'global' | 'project', projectPath?: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore storage failures
    }
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale: () => setLocale((current) => (current === 'zh' ? 'en' : 'zh')),
      t: (key, params) => translate(locale, key, params),
      formatMessage: (message) => formatMessageIn(locale, message),
      relativeTime: (iso) => relativeTimeIn(locale, iso),
      scopeLabel: (scope, projectPath) => {
        if (scope === 'global') return translate(locale, 'scope.global');
        const name = projectPath?.split('/').filter(Boolean).pop() ?? '';
        return translate(locale, 'scope.project', { name });
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('I18nProvider is missing');
  return value;
}

export type { Locale, MessageParams, MessageValue } from './types';
export type { MessageKey };
