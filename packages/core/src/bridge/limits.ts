/**
 * Activity-recording limits and sanitization.
 *
 * Kept free of any Node or heavy runtime imports so the renderer can import the
 * min/max constants through the lightweight `@skillcat/core/activity` subpath
 * without pulling the whole core index into its bundle.
 */
import type { ActivitySettings } from '../types.js';

export const ACTIVITY_RETENTION_MIN = 30;
export const ACTIVITY_RETENTION_MAX = 360;
export const ACTIVITY_PHRASE_MIN = 40;
export const ACTIVITY_PHRASE_MAX = 4000;

export function defaultActivitySettings(): ActivitySettings {
  return { enabled: true, storePhrase: true, retentionDays: 90, maxPhraseChars: 300 };
}

/** Clamps persisted activity settings into their supported ranges. */
export function sanitizeActivity(raw: unknown): ActivitySettings {
  const base = defaultActivitySettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Partial<ActivitySettings>;
  const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
  };
  return {
    enabled: input.enabled !== false,
    storePhrase: input.storePhrase !== false,
    retentionDays: clamp(
      input.retentionDays,
      ACTIVITY_RETENTION_MIN,
      ACTIVITY_RETENTION_MAX,
      base.retentionDays,
    ),
    maxPhraseChars: clamp(
      input.maxPhraseChars,
      ACTIVITY_PHRASE_MIN,
      ACTIVITY_PHRASE_MAX,
      base.maxPhraseChars,
    ),
  };
}
