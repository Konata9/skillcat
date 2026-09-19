import * as React from 'react';
import { useState } from 'react';
import type { RemoteSkill } from '@skillcat/core';
import { Search } from 'lucide-react';
import { formatInstalls } from '@renderer/lib/format';
import { useI18n } from '@renderer/lib/i18n';
import { EmptyState } from '../components/indicators';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export function SearchView({
  onSearch,
  onInstall,
}: {
  onSearch: (query: string) => Promise<RemoteSkill[]>;
  onInstall: (skill: RemoteSkill) => void;
}): React.ReactElement {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RemoteSkill[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const value = query.trim();
    if (!value || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await onSearch(value));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-2">
        <Input
          type="search"
          className="h-7"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void run();
          }}
        />
        <Button size="sm" onClick={() => void run()} disabled={loading}>
          <Search />
          {loading ? t('search.searching') : t('search.button')}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? <div className="px-3.5 py-3 text-destructive">{error}</div> : null}
        {results === null ? (
          <EmptyState>{t('search.emptyHint')}</EmptyState>
        ) : results.length === 0 ? (
          <EmptyState>{t('search.noResults')}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('search.tableSkill')}</TableHead>
                <TableHead>{t('search.tableSource')}</TableHead>
                <TableHead className="w-24">{t('search.tableInstalls')}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((skill) => (
                <TableRow key={`${skill.source}@${skill.name}`}>
                  <TableCell>{skill.name}</TableCell>
                  <TableCell className="text-muted-foreground">{skill.source}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatInstalls(skill.installs) || '—'}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => onInstall(skill)}>
                      {t('search.install')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
