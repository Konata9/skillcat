/**
 * Remote skill search: the skills.sh HTTP API with a text-parsing fallback
 * over `npx skills find` output. Output is sanitized before it reaches the UI.
 */
import { execa } from 'execa';
import type { LeaderboardKind, RemoteSkill } from '../types.js';
import { stripAnsi } from './ansi.js';

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
  const response = await fetchImpl(`${SEARCH_API_BASE}/api/search?${params.toString()}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`search API responded with ${response.status}`);
  }
  const data = (await response.json()) as SearchApiResponse;
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
  const response = await fetchImpl(`${SEARCH_API_BASE}/api/skills/${kind}/${page}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`leaderboard API responded with ${response.status}`);
  }
  const data = (await response.json()) as LeaderboardApiResponse;
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

export function parseFindOutput(stdout: string): RemoteSkill[] {
  const results: RemoteSkill[] = [];
  let pending: { source: string; name: string; installs: number } | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    const url = /^└\s+https:\/\/skills\.sh\/(.+)$/.exec(line);
    if (url && pending) {
      results.push({
        name: pending.name,
        slug: url[1]!.trim(),
        source: pending.source,
        installs: pending.installs,
      });
      pending = null;
      continue;
    }
    const entry = /^(\S+@\S+)(?:\s+([\d.]+[KM]?)\s+installs?)?$/.exec(line);
    if (entry) {
      const pkg = entry[1]!;
      const at = pkg.lastIndexOf('@');
      pending = {
        source: pkg.slice(0, at),
        name: pkg.slice(at + 1),
        installs: parseInstalls(entry[2]),
      };
    }
  }
  return results;
}

function parseInstalls(text: string | undefined): number {
  if (!text) return 0;
  const match = /^([\d.]+)([KM]?)$/.exec(text);
  if (!match) return 0;
  const value = Number.parseFloat(match[1] ?? '0');
  const unit = match[2];
  if (unit === 'K') return Math.round(value * 1_000);
  if (unit === 'M') return Math.round(value * 1_000_000);
  return Math.round(value);
}

export async function searchRemoteViaCli(
  command: string[],
  query: string,
  owner?: string,
): Promise<RemoteSkill[]> {
  const args = [...command.slice(1), 'find', query];
  if (owner) args.push('--owner', owner);
  const result = await execa(command[0]!, args, {
    timeout: 60_000,
    reject: false,
    stdin: 'ignore',
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (result.exitCode !== 0) return [];
  return parseFindOutput(stripAnsi(result.stdout));
}
