/**
 * Environment-agnostic logging seam.
 *
 * `@skillcat/core` must not depend on Electron (or any concrete logger), so it
 * logs through this tiny interface. The host (the desktop main process)
 * installs an adapter via `setLogger`; without one, logging is a no-op, which
 * keeps unit tests and future non-Electron consumers silent by default.
 */

export interface CoreLogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

const noop: CoreLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

let current: CoreLogger = noop;

/** Installs the host logger adapter; pass `null` to revert to a no-op. */
export function setLogger(logger: CoreLogger | null): void {
  current = logger ?? noop;
}

export function getLogger(): CoreLogger {
  return current;
}
