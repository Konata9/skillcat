/**
 * Update check against a GitHub repository's latest release. SkillCat does not
 * host its own update server; when the project is published the repo slug is
 * filled in and this queries the public releases API.
 */
import type { FetchLike } from './cli/remote-search.js';

export interface UpdateCheckResult {
  /** False when no repository is configured yet. */
  configured: boolean;
  /** `owner/repo` of the update source, empty when unconfigured. */
  repo: string;
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  /** Release page URL for the latest version, or the releases page when none exists. */
  url: string | null;
  publishedAt: string | null;
  error?: string;
}

function parseVersion(value: string): number[] {
  return value
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

/** Numeric semver-ish comparison; returns 1, 0 or -1 for a vs b. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Fetches `releases/latest` for `owner/repo` and compares its tag with
 * `currentVersion`. Never throws; failures come back as `{ error }`.
 */
export async function checkForUpdate(
  repo: string,
  currentVersion: string,
  fetchImpl: FetchLike = fetch,
): Promise<UpdateCheckResult> {
  const slug = repo.trim().replace(/^\/+|\/+$/g, '');
  const base: UpdateCheckResult = {
    configured: Boolean(slug),
    repo: slug,
    current: currentVersion,
    latest: null,
    hasUpdate: false,
    url: null,
    publishedAt: null,
  };
  if (!slug) return base;

  try {
    const response = await fetchImpl(`https://api.github.com/repos/${slug}/releases/latest`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'SkillCat',
      },
      signal: AbortSignal.timeout(15_000),
    });
    // A public repository with no published releases returns 404 for
    // `releases/latest`; that is a normal state, not a failed check.
    if (response.status === 404) {
      return { ...base, url: `https://github.com/${slug}/releases` };
    }
    if (!response.ok) return { ...base, error: `HTTP ${response.status}` };

    const data = (await response.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
      published_at?: unknown;
    };
    const latest = typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/i, '') : null;
    return {
      ...base,
      latest,
      hasUpdate: latest !== null && compareVersions(latest, currentVersion) > 0,
      url: typeof data.html_url === 'string' ? data.html_url : null,
      publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
