import * as React from 'react';
import { useEffect, useState } from 'react';
import type { LeaderboardKind, RemoteSkill } from '@skillcat/core';
import { Download, RefreshCw, Search } from 'lucide-react';
import { errorMessage, formatInstalls } from '@renderer/lib/format';
import { useI18n } from '@renderer/lib/i18n';
import type { MessageKey } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import { useLeaderboard } from '@renderer/hooks/useLeaderboard';
import { EmptyState } from '../components/indicators';
import { RemoteSkillDetailDrawer } from '../components/RemoteSkillDetailDrawer';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const LEADERBOARD_TABS: LeaderboardKind[] = ['all-time', 'trending', 'hot'];

const TAB_LABEL_KEY: Record<LeaderboardKind, MessageKey> = {
  'all-time': 'search.tabAllTime',
  trending: 'search.tabTrending',
  hot: 'search.tabHot',
};

/** Tiny inline sparkline of the trailing weekly install counts. */
function Sparkline({ values }: { values: number[] }): React.ReactElement {
  const width = 64;
  const height = 20;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - ((value - min) / span) * height).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 text-primary/60"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResultList({
  entries,
  showSparkline,
  onSelect,
  onInstall,
}: {
  entries: RemoteSkill[];
  showSparkline?: boolean;
  onSelect: (skill: RemoteSkill) => void;
  onInstall: (skill: RemoteSkill) => void;
}): React.ReactElement {
  const { t } = useI18n();

  return (
    <ol className="flex flex-col gap-0.5 p-1.5">
      {entries.map((skill, index) => {
        const installs = formatInstalls(skill.installs);
        const change = skill.change;
        return (
          <li
            key={`${skill.source}@${skill.name}`}
            className="flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-accent/60"
          >
            <button
              type="button"
              className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left"
              onClick={() => onSelect(skill)}
            >
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{skill.name}</span>
                  {skill.isOfficial ? <Badge tone="accent">{t('search.official')}</Badge> : null}
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {skill.source}
                </div>
              </div>
            </button>
            {showSparkline && skill.weeklyInstalls ? (
              <Sparkline values={skill.weeklyInstalls} />
            ) : null}
            <div className="w-20 shrink-0 text-right" title={t('search.installsLabel')}>
              <div className="flex items-center justify-end gap-1 text-[11px] tabular-nums text-muted-foreground">
                <Download className="size-3" />
                {installs || '—'}
              </div>
              {change !== undefined && change !== 0 ? (
                <div className="text-[11px] tabular-nums text-success">
                  {change > 0 ? `+${change}` : String(change)}
                </div>
              ) : null}
            </div>
            <Button size="sm" onClick={() => onInstall(skill)}>
              {t('search.install')}
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

export function SearchView({
  onSearch,
  onLeaderboard,
  onInstall,
}: {
  onSearch: (query: string) => Promise<RemoteSkill[]>;
  onLeaderboard: (kind: LeaderboardKind, page?: number) => Promise<RemoteSkill[]>;
  onInstall: (skill: RemoteSkill) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const { boards, loadingKind, error: boardError, load } = useLeaderboard(onLeaderboard);
  const [mode, setMode] = useState<'leaderboard' | 'search'>('leaderboard');
  const [kind, setKind] = useState<LeaderboardKind>('all-time');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [results, setResults] = useState<RemoteSkill[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RemoteSkill | null>(null);

  useEffect(() => {
    void load('all-time');
  }, [load]);

  const runSearch = async () => {
    const value = query.trim();
    if (!value || searching) return;
    setMode('search');
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await onSearch(value));
      setSubmitted(value);
    } catch (error) {
      setSearchError(errorMessage(error));
      setResults([]);
      setSubmitted(value);
    } finally {
      setSearching(false);
    }
  };

  const selectTab = (target: LeaderboardKind) => {
    setMode('leaderboard');
    setKind(target);
    void load(target);
  };

  const clearSearch = () => {
    setMode('leaderboard');
    setQuery('');
    setSubmitted('');
    setResults(null);
    setSearchError(null);
  };

  const entries = mode === 'search' ? results : (boards[kind] ?? null);
  const busy = mode === 'search' ? searching : loadingKind === kind;
  const error = mode === 'search' ? searchError : boardError;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="h-7 pl-7"
            placeholder={t('search.placeholder')}
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
          />
        </div>
        <Button size="sm" onClick={() => void runSearch()} disabled={searching}>
          {searching ? t('search.searching') : t('search.button')}
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3.5 py-1.5">
        {mode === 'search' ? (
          <>
            <span className="text-[11px] text-muted-foreground">
              {t('search.resultsSummary', { n: results?.length ?? 0, query: submitted })}
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={clearSearch}>
              {t('search.clearSearch')}
            </Button>
          </>
        ) : (
          <>
            {LEADERBOARD_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => selectTab(tab)}
                className={cn(
                  'focus-ring rounded border border-transparent px-2.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground',
                  kind === tab && 'border-input bg-secondary text-foreground',
                )}
              >
                {t(TAB_LABEL_KEY[tab])}
              </button>
            ))}
            <div className="flex-1" />
            <span className="text-[11px] text-muted-foreground">{t('search.sourceNote')}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('search.refresh')}
              title={t('search.refresh')}
              disabled={busy}
              onClick={() => void load(kind, true)}
            >
              <RefreshCw className={cn(busy && 'animate-spin')} />
            </Button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? <div className="px-3.5 py-3 text-destructive">{error}</div> : null}

        {entries === null ? (
          busy ? (
            <EmptyState>{t('search.loading')}</EmptyState>
          ) : (
            <EmptyState className="flex flex-col items-center gap-2">
              <Search className="size-5 text-muted-foreground/60" />
              <span className="max-w-[44ch]">{t('search.emptyHint')}</span>
            </EmptyState>
          )
        ) : entries.length === 0 ? (
          <EmptyState className="flex flex-col items-center gap-2">
            <Search className="size-5 text-muted-foreground/60" />
            <span>{t('search.noResults')}</span>
          </EmptyState>
        ) : (
          <ResultList
            entries={entries}
            showSparkline={mode === 'leaderboard' && kind === 'all-time'}
            onSelect={setSelected}
            onInstall={onInstall}
          />
        )}
      </div>

      <RemoteSkillDetailDrawer
        skill={selected}
        onInstall={onInstall}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
