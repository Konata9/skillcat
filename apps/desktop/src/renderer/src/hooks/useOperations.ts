/**
 * Streaming CLI operation state machine: starts an op, appends its output
 * lines as they arrive and tracks completion. Errors from `startOp` are
 * reported through the injected `onError` callback so this hook stays free of
 * UI copy.
 */
import { useCallback, useEffect, useState } from 'react';
import type { OpStart, SkillCatApi } from '@shared/contract';
import type { OpState } from '../components/OperationDrawer';

export interface OperationsController {
  op: OpState | null;
  startOp: (request: OpStart) => Promise<void>;
  cancelOp: () => void;
  closeOp: () => void;
}

export function useOperations(
  api: SkillCatApi,
  onError: (error: unknown) => void,
): OperationsController {
  const [op, setOp] = useState<OpState | null>(null);

  useEffect(
    () =>
      api.onOpEvent((event) => {
        setOp((current) => {
          if (!current || current.opId !== event.opId) return current;
          if (event.done) return { ...current, done: true, ok: event.ok ?? false };
          if (event.line !== undefined) {
            return { ...current, lines: [...current.lines, event.line] };
          }
          return current;
        });
      }),
    [api],
  );

  const startOp = useCallback(
    async (request: OpStart) => {
      try {
        const { opId } = await api.startOp(request);
        setOp({ opId, title: request.title, lines: [], done: false, ok: null });
      } catch (error) {
        onError(error);
      }
    },
    [api, onError],
  );

  const cancelOp = useCallback(() => {
    if (op) void api.cancelOp(op.opId);
  }, [api, op]);

  const closeOp = useCallback(() => setOp(null), []);

  return { op, startOp, cancelOp, closeOp };
}
