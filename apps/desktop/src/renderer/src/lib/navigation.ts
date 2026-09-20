/**
 * Top-level navigation model shared by the shell, sidebar and toolbar.
 */
import type { MessageKey } from './i18n';

export type Tab = 'skills' | 'analysis' | 'projects' | 'search' | 'settings';

export const TAB_ORDER: readonly Tab[] = [
  'skills',
  'analysis',
  'projects',
  'search',
  'settings',
];

export const TAB_LABEL_KEY: Record<Tab, MessageKey> = {
  skills: 'nav.skills',
  analysis: 'nav.analysis',
  projects: 'nav.projects',
  search: 'nav.search',
  settings: 'nav.settings',
};
