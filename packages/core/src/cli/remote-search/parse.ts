/**
 * Fallback remote search over `npx skills find` output. The CLI has no JSON
 * mode here, so its human-facing table is parsed; ANSI is stripped first.
 */
import { execa } from 'execa';
import type { RemoteSkill } from '../../types.js';
import { stripAnsi } from '../ansi.js';

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
