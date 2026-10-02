/**
 * Shared coercion helpers for untrusted frontmatter / API values. Parsing paths
 * (local SKILL.md, remote skill detail, trigger extraction, LLM catalog) must
 * interpret YAML scalars, arrays and absence the same way.
 */

/** Coerce a value to a display string; arrays join on newlines. */
export function coerceString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join('\n');
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Trimmed non-empty string, else the fallback. */
export function coerceTrimmed(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Coerce a value to a list of strings, dropping non-string entries. */
export function toStringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}
