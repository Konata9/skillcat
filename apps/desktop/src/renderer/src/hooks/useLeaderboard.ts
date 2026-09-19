/**
 * Leaderboard data with a session-wide cache. Re-entering the search view
 * reuses a freshly fetched board instead of refetching; entries older than the
 * TTL are refreshed, and concurrent requests for the same board are deduped.
 */
import { useCallback, useRef, useState } from 'react';
import type { LeaderboardKind, RemoteSkill } from '@skillcat/core';
import { errorMessage } from '@renderer/lib/format';

const TTL_MS = 10 * 60_000;

interface CacheEntry {
  entries: RemoteSkill[];
  fetchedAt: number;
}

const cache = new Map<LeaderboardKind, CacheEntry>();
const inflight = new Map<LeaderboardKind, Promise<RemoteSkill[]>>();

/** Test/edge helper: drops every cached board. */
export function resetLeaderboardCache(): void {
  cache.clear();
  inflight.clear();
}

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return entry !== undefined && Date.now() - entry.fetchedAt < TTL_MS;
}

function seed(): Partial<Record<LeaderboardKind, RemoteSkill[]>> {
  const boards: Partial<Record<LeaderboardKind, RemoteSkill[]>> = {};
  for (const [kind, entry] of cache) boards[kind] = entry.entries;
  return boards;
}

export interface LeaderboardController {
  boards: Partial<Record<LeaderboardKind, RemoteSkill[]>>;
  loadingKind: LeaderboardKind | null;
  error: string | null;
  load: (kind: LeaderboardKind, force?: boolean) => Promise<void>;
}

export function useLeaderboard(
  loader: (kind: LeaderboardKind) => Promise<RemoteSkill[]>,
): LeaderboardController {
  const [boards, setBoards] = useState(seed);
  const [loadingKind, setLoadingKind] = useState<LeaderboardKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const load = useCallback(async (kind: LeaderboardKind, force = false) => {
    if (!force && isFresh(cache.get(kind))) return;

    setLoadingKind(kind);
    setError(null);
    try {
      let pending = inflight.get(kind);
      if (!pending) {
        pending = loaderRef.current(kind)
          .then((entries) => {
            cache.set(kind, { entries, fetchedAt: Date.now() });
            return entries;
          })
          .finally(() => {
            inflight.delete(kind);
          });
        inflight.set(kind, pending);
      }
      const entries = await pending;
      setBoards((prev) => ({ ...prev, [kind]: entries }));
    } catch (loadError) {
      setError(errorMessage(loadError));
      setBoards((prev) => (kind in prev ? prev : { ...prev, [kind]: [] }));
    } finally {
      setLoadingKind((current) => (current === kind ? null : current));
    }
  }, []);

  return { boards, loadingKind, error, load };
}
