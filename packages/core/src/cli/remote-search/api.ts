/**
 * skills.sh HTTP API access: skill search, leaderboards and published-skill
 * detail. Output is sanitized before it reaches the UI, and the transport is
 * injectable so the host can supply a proxy-aware `net.fetch`.
 */
import { coerceString, coerceTrimmed } from '../../coerce.js';
import { fetchJson } from '../../http.js';
import { parseFrontmatter } from '../../skill.js';
import type {
  LeaderboardKind,
  RemoteSkill,
  RemoteSkillDetail,
  RemoteSkillFile,
} from '../../types.js';

const SEARCH_API_BASE = process.env.SKILLS_API_URL ?? 'https://skills.sh';
const SEARCH_LIMIT = '20';

/**
 * Minimal structural shape both the global `fetch` and Electron's proxy-aware
 * `net.fetch` satisfy — lets the host inject a proxied transport.
 */
export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
}

export interface FetchLikeInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type FetchLike = (url: string, init?: FetchLikeInit) => Promise<FetchLikeResponse>;

interface SearchApiResponse {
  skills?: Array<{
    name?: unknown;
    id?: unknown;
    source?: unknown;
    installs?: unknown;
  }>;
}

function sanitize(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
}

export async function searchRemoteApi(
  query: string,
  owner?: string,
  fetchImpl: FetchLike = fetch,
): Promise<RemoteSkill[]> {
  const params = new URLSearchParams({ q: query, limit: SEARCH_LIMIT });
  if (owner) params.set('owner', owner);
  const data = await fetchJson<SearchApiResponse>(
    `${SEARCH_API_BASE}/api/search?${params.toString()}`,
    'search API',
    { fetchImpl },
  );
  return (data.skills ?? [])
    .map((skill) => ({
      name: sanitize(skill.name),
      slug: sanitize(skill.id),
      source: sanitize(skill.source),
      installs: typeof skill.installs === 'number' ? skill.installs : 0,
    }))
    .filter((skill) => skill.name.length > 0 && skill.slug.length > 0)
    .sort((a, b) => b.installs - a.installs);
}

interface LeaderboardApiResponse {
  skills?: Array<{
    name?: unknown;
    skillId?: unknown;
    source?: unknown;
    installs?: unknown;
    weeklyInstalls?: unknown;
    change?: unknown;
    isOfficial?: unknown;
  }>;
}

function toWeeklyInstalls(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const weeks = value.filter(
    (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry),
  );
  return weeks.length > 0 ? weeks : undefined;
}

/**
 * Fetches a skills.sh leaderboard page (`all-time`, `trending` or `hot`).
 * Unlike keyword search the server order is meaningful, so it is preserved.
 */
export async function fetchLeaderboardApi(
  kind: LeaderboardKind,
  page = 0,
  fetchImpl: FetchLike = fetch,
): Promise<RemoteSkill[]> {
  const data = await fetchJson<LeaderboardApiResponse>(
    `${SEARCH_API_BASE}/api/skills/${kind}/${page}`,
    'leaderboard API',
    { fetchImpl },
  );
  return (data.skills ?? [])
    .map((skill) => {
      const source = sanitize(skill.source);
      const skillId = sanitize(skill.skillId);
      const name = sanitize(skill.name) || skillId;
      const entry: RemoteSkill = {
        name,
        slug: skillId ? `${source}/${skillId}` : source,
        source,
        installs: typeof skill.installs === 'number' ? skill.installs : 0,
      };
      const weeks = toWeeklyInstalls(skill.weeklyInstalls);
      if (weeks) entry.weeklyInstalls = weeks;
      if (typeof skill.change === 'number') entry.change = skill.change;
      if (skill.isOfficial === true) entry.isOfficial = true;
      return entry;
    })
    .filter((skill) => skill.name.length > 0 && skill.source.length > 0);
}

interface DownloadApiResponse {
  files?: Array<{ path?: unknown; contents?: unknown }>;
  hash?: unknown;
}

/**
 * Fetches a skill's published files from skills.sh (`/api/download/<slug>`)
 * and parses SKILL.md. This is the same payload the website renders, so the
 * drawer can mirror the site's SKILL.md and metadata exactly.
 */
export async function fetchRemoteSkillDetail(
  slug: string,
  fetchImpl: FetchLike = fetch,
): Promise<RemoteSkillDetail> {
  const path = slug
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  if (!path) throw new Error('skill slug is required');
  const data = await fetchJson<DownloadApiResponse>(
    `${SEARCH_API_BASE}/api/download/${path}`,
    'skill detail API',
    { fetchImpl, timeoutMs: 20_000 },
  );
  const files: RemoteSkillFile[] = (data.files ?? [])
    .map((file) => ({
      path: sanitize(file.path),
      contents: typeof file.contents === 'string' ? file.contents : '',
    }))
    .filter((file) => file.path.length > 0);
  const skillFile = files.find((file) => file.path.toLowerCase() === 'skill.md');
  if (!skillFile) throw new Error(`skill ${slug} has no SKILL.md`);

  const { data: frontmatter, content } = parseFrontmatter(skillFile.contents);
  const segments = slug.split('/').filter((segment) => segment.length > 0);
  const source = segments.slice(0, -1).join('/');
  const fallbackName = segments.at(-1) ?? slug;
  const name = coerceTrimmed(frontmatter.name, fallbackName);
  const description = coerceString(frontmatter.description).trim();
  const license = coerceTrimmed(frontmatter.license) || null;

  return {
    name,
    source,
    slug,
    description,
    license,
    frontmatter,
    body: content,
    files,
    installCommand: `npx skills add https://github.com/${source} --skill ${name}`,
    hash: sanitize(data.hash) || null,
  };
}
