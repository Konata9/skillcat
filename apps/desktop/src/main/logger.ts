/**
 * Diagnostic logging for the main process, backed by `electron-log`.
 *
 * One rotating file (`<configDir>/logs/main.log`) receives main- and
 * renderer-process messages; the renderer forwards over IPC via the preload
 * bridge. Rotation is size-based (electron-log native): the current file plus
 * one `.old` archive stay within the configured total budget. Unknown-object
 * fields and common secret shapes are redacted before anything is written.
 */
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultLoggingSettings, logsDir, setLogger, type LoggingSettings } from '@skillcat/core';
import log from 'electron-log/main';

const MB = 1024 * 1024;

/** Common secret shapes that must never reach disk. */
const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(sk-[A-Za-z0-9_-]{6,})\b/g, 'sk-***'],
  [/\b(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***'],
  [
    /\b((?:api[_-]?key|authorization|token|secret|password)"?\s*[:=]\s*"?)([^\s"',}]+)/gi,
    '$1***',
  ],
];

const SECRET_KEY = /api[_-]?key|authorization|token|secret|password/i;

function redactString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message), stack: value.stack };
  }
  if (depth >= 4) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '***' : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** Configures transports and error capture. Call once, before the first window. */
export function setupLogging(configDir: string): void {
  log.transports.file.resolvePathFn = () => join(logsDir(configDir), 'main.log');
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  log.transports.console.format = '{h}:{i}:{s} [{level}] {text}';

  log.hooks.push((message) => {
    message.data = message.data.map((item) => redact(item));
    return message;
  });

  log.errorHandler.startCatching({ showDialog: false });

  // Sane defaults until the loaded config is applied; keeps startup logs bounded.
  applyLogging(defaultLoggingSettings());
}

/** Applies the user's logging preferences to the transports, live. */
export function applyLogging(settings: LoggingSettings): void {
  const level = settings.enabled ? settings.level : false;
  log.transports.file.level = level;
  log.transports.console.level = level;
  // Total on-disk budget = current file + one archive, so each may take half.
  log.transports.file.maxSize = Math.round((settings.maxTotalMb * MB) / 2);
}

/** Empties the current log file and removes its rotated archive. */
export async function clearLogs(): Promise<void> {
  const file = log.transports.file.getFile();
  file.clear();
  const archive = `${file.path.replace(/\.log$/, '')}.old.log`;
  await unlink(archive).catch(() => {});
}

/** Routes `@skillcat/core` logging through the same electron-log instance. */
export function installCoreLogger(): void {
  setLogger({
    debug: (message, meta) => (meta === undefined ? log.debug(message) : log.debug(message, meta)),
    info: (message, meta) => (meta === undefined ? log.info(message) : log.info(message, meta)),
    warn: (message, meta) => (meta === undefined ? log.warn(message) : log.warn(message, meta)),
    error: (message, meta) => (meta === undefined ? log.error(message) : log.error(message, meta)),
  });
}

export { log };
