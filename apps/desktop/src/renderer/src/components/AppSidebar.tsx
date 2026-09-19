/**
 * Left sidebar: product mark, primary navigation with counts, scope list and
 * the footer with scan status, locale and theme toggles.
 */
import * as React from 'react';
import type { Snapshot } from '@shared/contract';
import { Languages, Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { useI18n } from '@renderer/lib/i18n';
import { TAB_LABEL_KEY, TAB_ORDER, type Tab } from '@renderer/lib/navigation';
import { useTheme } from '@renderer/lib/theme';
import { cn } from '@renderer/lib/utils';
import type { ScopeOption } from '@renderer/hooks/useScopes';

export function AppSidebar({
  tab,
  onSelectTab,
  navCounts,
  scopes,
  scopeKey,
  onSelectScope,
  snapshot,
  conflictCount,
}: {
  tab: Tab;
  onSelectTab: (tab: Tab) => void;
  navCounts: Record<Tab, string>;
  scopes: ScopeOption[];
  scopeKey: string;
  onSelectScope: (key: string) => void;
  snapshot: Snapshot | null;
  conflictCount: number;
}): React.ReactElement {
  const { t, relativeTime, toggleLocale } = useI18n();
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-card">
      <div className="px-4 pt-4 pb-3 text-[15px] font-semibold tracking-wide">
        Skill<span className="text-primary">Cat</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 pb-3">
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelectTab(key)}
            className={cn(
              'focus-ring flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              tab === key && 'bg-primary/10 text-primary',
            )}
          >
            <span>{t(TAB_LABEL_KEY[key])}</span>
            {navCounts[key] ? (
              <span className="text-[11px] text-muted-foreground">{navCounts[key]}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="section-label px-4 pt-2 pb-1">{t('app.scopeHeading')}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {scopes.map((scope) => (
          <button
            key={scope.key}
            type="button"
            onClick={() => onSelectScope(scope.key)}
            className={cn(
              'focus-ring block w-full truncate rounded-md px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              scopeKey === scope.key && 'bg-accent text-foreground',
            )}
          >
            <span>
              {scope.label} <span className="text-[11px] text-muted-foreground">({scope.count})</span>
            </span>
            {scope.path ? (
              <span className="block truncate text-[11px] text-muted-foreground">{scope.path}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span>
            {snapshot?.loading
              ? t('app.scanning')
              : t('app.scannedAt', { time: relativeTime(snapshot?.scannedAt) })}
          </span>
          <span>
            {snapshot?.cliAvailable ? t('app.cliAvailable') : t('app.cliUnavailable')} ·{' '}
            {t('app.conflictsCount', { count: conflictCount })}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('app.localeSwitch')}
            title={t('app.localeSwitch')}
            onClick={toggleLocale}
          >
            <Languages />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={theme === 'dark' ? t('app.themeToLight') : t('app.themeToDark')}
            title={theme === 'dark' ? t('app.themeToLight') : t('app.themeToDark')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
