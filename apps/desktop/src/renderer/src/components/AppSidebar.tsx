/**
 * Left sidebar: product mark, primary navigation with counts, scope list and
 * the footer with scan status, locale and theme toggles.
 */
import * as React from 'react';
import { useMemo, useState } from 'react';
import type { Snapshot } from '@shared/contract';
import { Languages, LoaderCircle, Moon, Search, Sun } from 'lucide-react';
import logoUrl from '@renderer/assets/logo.png';
import { Button } from './ui/button';
import { Input } from './ui/input';
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
  analysisCount,
}: {
  tab: Tab;
  onSelectTab: (tab: Tab) => void;
  navCounts: Record<Tab, string>;
  scopes: ScopeOption[];
  scopeKey: string;
  onSelectScope: (key: string) => void;
  snapshot: Snapshot | null;
  analysisCount: number;
}): React.ReactElement {
  const { t, relativeTime, toggleLocale } = useI18n();
  const { theme, toggle: toggleTheme } = useTheme();
  const [projectFilter, setProjectFilter] = useState('');

  const hasProjects = scopes.some((scope) => scope.path !== null);
  const query = projectFilter.trim().toLowerCase();
  const visibleScopes = useMemo(() => {
    if (!query) return scopes;
    return scopes.filter((scope) => {
      // Keep the global entry and the current selection reachable while filtering.
      if (scope.path === null || scope.key === scopeKey) return true;
      return scope.label.toLowerCase().includes(query) || (scope.path ?? '').toLowerCase().includes(query);
    });
  }, [scopes, query, scopeKey]);

  const projectCount = visibleScopes.filter((scope) => scope.path !== null).length;

  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 text-[15px] font-semibold tracking-wide">
        <img src={logoUrl} alt="" className="size-6 shrink-0" />
        <span>
          Skill<span className="text-primary">Cat</span>
        </span>
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
      {hasProjects ? (
        <div className="relative px-2 pb-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="h-7 pl-7"
            placeholder={t('app.scopeSearchPlaceholder')}
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {visibleScopes.map((scope) => (
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
        {query && projectCount === 0 ? (
          <div className="px-2.5 py-2 text-[11px] text-muted-foreground">
            {t('app.scopeNoMatch')}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5">
            {!snapshot || snapshot.loading ? (
              <>
                <LoaderCircle className="size-3 animate-spin" />
                {t('app.scanning')}
              </>
            ) : (
              t('app.scannedAt', { time: relativeTime(snapshot.scannedAt) })
            )}
          </span>
          <span>
            {snapshot?.cliAvailable ? t('app.cliAvailable') : t('app.cliUnavailable')} ·{' '}
            {t('app.analysisCount', { count: analysisCount })}
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
