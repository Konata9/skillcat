/**
 * Accumulates the transient evaluation process log streamed from the main
 * process. Resets when a new run starts; nothing here is persisted.
 */
import { useEffect, useState } from 'react';
import type { EvaluationEvent } from '@skillcat/core';
import type { SkillCatApi } from '@shared/contract';

const MAX_EVENTS = 500;

export interface EvaluationLogController {
  events: EvaluationEvent[];
}

export function useEvaluationLog(api: SkillCatApi): EvaluationLogController {
  const [events, setEvents] = useState<EvaluationEvent[]>([]);

  useEffect(
    () =>
      api.onEvaluationEvent((event) => {
        if (event.type === 'start') {
          setEvents([]);
          return;
        }
        if (event.type === 'done') return;
        setEvents((current) => [...current, event].slice(-MAX_EVENTS));
      }),
    [api],
  );

  return { events };
}
