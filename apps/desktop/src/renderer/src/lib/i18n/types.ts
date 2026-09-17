import type { FindingParam } from '@skillman/core';

export type Locale = 'zh' | 'en';

export type MessageParams = Record<string, FindingParam>;

/** A plain string, or plural forms selected via Intl.PluralRules. */
export type MessageValue = string | { one: string; other: string };
