import { useCallback, useState } from 'react';

/**
 * Runs an async action with a boolean pending flag, removing the repeated
 * `try/finally` loading boilerplate.
 */
export function useAsyncAction<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
): {
  run: (...args: Args) => Promise<R | undefined>;
  pending: boolean;
} {
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (...args: Args): Promise<R | undefined> => {
      setPending(true);
      try {
        return await action(...args);
      } finally {
        setPending(false);
      }
    },
    [action],
  );
  return { run, pending };
}
