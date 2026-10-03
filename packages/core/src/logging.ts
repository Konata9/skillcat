/**
 * Diagnostic-logging limits and sanitization.
 *
 * Kept free of any Node or heavy runtime imports so the renderer can import the
 * constants through the lightweight `@skillcat/core/logging` subpath without
 * pulling the whole core index into its bundle.
 */
import type { LoggingSettings, LogLevel } from './types.js';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Total on-disk log budget bounds, in megabytes. */
export const LOG_SIZE_MIN_MB = 1;
export const LOG_SIZE_MAX_MB = 30;

export function defaultLoggingSettings(): LoggingSettings {
  return { enabled: true, level: 'info', maxTotalMb: 5 };
}

/** Clamps persisted logging settings into their supported ranges. */
export function sanitizeLogging(raw: unknown): LoggingSettings {
  const base = defaultLoggingSettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Partial<LoggingSettings>;
  const level = LOG_LEVELS.includes(input.level as LogLevel) ? (input.level as LogLevel) : base.level;
  const maxTotalMb =
    typeof input.maxTotalMb === 'number' && Number.isFinite(input.maxTotalMb)
      ? Math.min(LOG_SIZE_MAX_MB, Math.max(LOG_SIZE_MIN_MB, Math.round(input.maxTotalMb)))
      : base.maxTotalMb;
  return {
    enabled: input.enabled !== false,
    level,
    maxTotalMb,
  };
}
