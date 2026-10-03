/**
 * Top-level navigation model shared by the shell, sidebar and toolbar.
 */
import type { MessageKey } from './i18n';

export type Tab = 'skills' | 'analysis' | 'activity' | 'search' | 'settings';

export const TAB_ORDER: readonly Tab[] = [
  'skills',
  'analysis',
  'activity',
  'search',
  'settings',
];

export const TAB_LABEL_KEY: Record<Tab, MessageKey> = {
  skills: 'nav.skills',
  analysis: 'nav.analysis',
  activity: 'nav.activity',
  search: 'nav.search',
  settings: 'nav.settings',
};

/** Optional second line that spells out what each destination does. */
export const TAB_HINT_KEY: Partial<Record<Tab, MessageKey>> = {
  skills: 'nav.skills.hint',
  analysis: 'nav.analysis.hint',
  activity: 'nav.activity.hint',
  search: 'nav.search.hint',
};
