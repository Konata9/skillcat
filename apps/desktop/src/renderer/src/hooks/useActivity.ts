import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityStats, RuntimeSkillEvent } from '@skillcat/core';
import type { SkillCatApi } from '@shared/contract';

/**
 * Loads the activity log and its aggregates, and refreshes them whenever the
 * main process reports a freshly ingested batch (or a new scan).
 */
export function useActivity(
  api: SkillCatApi,
  scannedAt: string | null,
): { events: RuntimeSkillEvent[]; stats: ActivityStats | null; reload: () => Promise<void> } {
  const [events, setEvents] = useState<RuntimeSkillEvent[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const [nextEvents, nextStats] = await Promise.all([
      api.activityEvents(),
      api.activityStats(),
    ]);
    if (!mounted.current) return;
    setEvents(nextEvents);
    setStats(nextStats);
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload, scannedAt]);

  useEffect(() => api.onActivity(() => void reload()), [api, reload]);

  return { events, stats, reload };
}
