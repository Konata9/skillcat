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
