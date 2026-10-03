import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigStore } from '../config.js';
import {
  LOG_SIZE_MAX_MB,
  LOG_SIZE_MIN_MB,
  defaultLoggingSettings,
  sanitizeLogging,
} from '../logging.js';

describe('logging settings', () => {
  it('defaults to enabled, info and 5 MB', () => {
    expect(defaultLoggingSettings()).toEqual({ enabled: true, level: 'info', maxTotalMb: 5 });
  });

  it('falls back to defaults for a malformed value', () => {
    expect(sanitizeLogging(null)).toEqual(defaultLoggingSettings());
    expect(sanitizeLogging('nope')).toEqual(defaultLoggingSettings());
  });

  it('rejects an unknown level and keeps the default', () => {
    expect(sanitizeLogging({ level: 'silly' }).level).toBe('info');
    expect(sanitizeLogging({ level: 'debug' }).level).toBe('debug');
  });

  it('clamps and rounds the size budget', () => {
    expect(sanitizeLogging({ maxTotalMb: 0.4 }).maxTotalMb).toBe(LOG_SIZE_MIN_MB);
    expect(sanitizeLogging({ maxTotalMb: 999 }).maxTotalMb).toBe(LOG_SIZE_MAX_MB);
    expect(sanitizeLogging({ maxTotalMb: 12.6 }).maxTotalMb).toBe(13);
  });

  it('treats a missing enabled flag as enabled', () => {
    expect(sanitizeLogging({}).enabled).toBe(true);
    expect(sanitizeLogging({ enabled: false }).enabled).toBe(false);
  });

  it('loads and sanitizes logging from config.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skillcat-logging-'));
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ version: 1, logging: { enabled: false, level: 'warn', maxTotalMb: 40 } }),
    );

    const config = await new ConfigStore(dir).load();
    expect(config.logging).toEqual({ enabled: false, level: 'warn', maxTotalMb: 30 });
  });
});
