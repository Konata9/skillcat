/**
 * Types crossing the `npx skills` boundary: parsed CLI output, remote search
 * results and the streaming operation handle returned to the UI.
 */
import type { Scope } from './domain.js';

export interface CliSkill {
  name: string;
  path: string;
  scope: Scope;
  agents: string[];
  source: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
}

export interface RemoteSkill {
  name: string;
  slug: string;
  source: string;
  installs: number;
  /** Weekly install counts, oldest → newest (all-time leaderboard only). */
  weeklyInstalls?: number[];
  /** Net install change over the last day (hot leaderboard only). */
  change?: number;
  /** Published by a first-party / official source. */
  isOfficial?: boolean;
}

/** One file inside a published skill, as returned by the skills.sh download API. */
export interface RemoteSkillFile {
  path: string;
  contents: string;
}

/**
 * The detail payload behind a skills.sh skill page (`/api/download`): the
 * parsed SKILL.md plus every supporting file, so the drawer can show exactly
 * what the website shows.
 */
export interface RemoteSkillDetail {
  name: string;
  source: string;
  slug: string;
  description: string;
  license: string | null;
  frontmatter: Record<string, unknown>;
  /** SKILL.md body with the YAML frontmatter stripped. */
  body: string;
  files: RemoteSkillFile[];
  /** `npx skills add …` command shown on the website. */
  installCommand: string;
  hash: string | null;
}

/** Leaderboard views exposed by skills.sh. */
export type LeaderboardKind = 'all-time' | 'trending' | 'hot';

/** One install destination for `SkillManager.runAdd`. */
export interface AddTarget {
  scope: Scope;
  cwd?: string;
}

export interface OpResult {
  ok: boolean;
  code: number | null;
}

/** A running CLI invocation: streamed lines plus a final result promise. */
export interface AsyncOp {
  id: string;
  title: string;
  lines: AsyncIterable<string>;
  result: Promise<OpResult>;
  cancel: () => void;
}
