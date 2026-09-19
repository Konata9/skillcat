/**
 * Proxy URL parsing/validation and child-process environment building.
 *
 * The URL helpers are deliberately dependency-free (type-only imports), so the
 * settings UI validates proxy input with the exact same rules the CLI uses via
 * the `@skillcat/core/proxy` subpath export.
 */
import type { ProxySettings } from '../types.js';

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const SUPPORTED_SCHEMES = new Set(['http:', 'https:', 'socks:', 'socks5:', 'socks5h:']);

export function normalizeProxyUrl(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  return SCHEME_PATTERN.test(value) ? value : `http://${value}`;
}

export function isValidProxyUrl(raw: string | undefined): boolean {
  const normalized = normalizeProxyUrl(raw);
  if (!normalized) return true; // blank means "direct", not invalid
  try {
    const parsed = new URL(normalized);
    return SUPPORTED_SCHEMES.has(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Environment for every `npx skills` child process.
 *
 * `NODE_USE_ENV_PROXY=1` makes Node's built-in fetch honour the proxy vars
 * (verified on Node 24); git and npm/curl pick up the *_proxy vars on their own.
 */
export function buildProxyEnv(proxy: ProxySettings | undefined): Record<string, string> {
  const url = normalizeProxyUrl(proxy?.url);
  if (!url || !isValidProxyUrl(url)) return {};

  const env: Record<string, string> = {
    HTTP_PROXY: url,
    HTTPS_PROXY: url,
    ALL_PROXY: url,
    http_proxy: url,
    https_proxy: url,
    all_proxy: url,
    NODE_USE_ENV_PROXY: '1',
  };

  const bypass = (proxy?.bypass ?? '').trim();
  if (bypass) {
    env.NO_PROXY = bypass;
    env.no_proxy = bypass;
  }
  return env;
}
