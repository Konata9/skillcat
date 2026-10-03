/**
 * Agent-link state computation for one skill directory: for each agent that
 * could see the skill, whether its dir holds the canonical copy, a valid or
 * dangling symlink, a drifted copy, or nothing at all. Extracted from
 * `discovery.ts` so the filesystem walk and the link analysis evolve apart.
 */
import { join, resolve } from 'node:path';
import type { AgentDef } from '../agents.js';
import { computeSkillFolderHash, lstatSafe, readlinkSafe, safeRealpath } from '../fs-utils.js';
import type { AgentLink } from '../types.js';

export interface AgentDirInfo {
  agent: AgentDef;
  dir: string;
}

export interface ComputeLinksArgs {
  dirName: string;
  skillPath: string;
  canonicalDir: string;
  agentDirs: AgentDirInfo[];
  copyHashCache: Map<string, string>;
}

export async function computeLinks(args: ComputeLinksArgs): Promise<AgentLink[]> {
  const links: AgentLink[] = [];
  const canonicalPath = resolve(join(args.canonicalDir, args.dirName));
  const selfPath = resolve(args.skillPath);
  const seen = new Set<string>();

  const candidatesByAgent = new Map<string, AgentDirInfo[]>();
  for (const info of args.agentDirs) {
    const key = `${info.agent.id}:${resolve(info.dir)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = candidatesByAgent.get(info.agent.id);
    if (list) list.push(info);
    else candidatesByAgent.set(info.agent.id, [info]);
  }

  for (const candidates of candidatesByAgent.values()) {
    let fallback: AgentDirInfo | null = null;
    let found = false;
    for (const { agent, dir } of candidates) {
      const expected = join(dir, args.dirName);
      const stats = await lstatSafe(expected);
      if (!stats) {
        fallback ??= { agent, dir };
        continue;
      }
      found = true;

      if (resolve(expected) === canonicalPath || resolve(expected) === selfPath) {
        links.push({
          agentId: agent.id,
          display: agent.display,
          dir,
          path: expected,
          state: 'canonical',
        });
        continue;
      }

      if (stats.isSymbolicLink()) {
        const real = await safeRealpath(expected);
        if (real) {
          links.push({
            agentId: agent.id,
            display: agent.display,
            dir,
            path: expected,
            state: 'symlink-ok',
            target: real,
          });
        } else {
          links.push({
            agentId: agent.id,
            display: agent.display,
            dir,
            path: expected,
            state: 'symlink-dangling',
            target: (await readlinkSafe(expected)) ?? undefined,
          });
        }
        continue;
      }

      if (stats.isDirectory()) {
        let copyHash = args.copyHashCache.get(expected);
        if (!copyHash) {
          copyHash = await computeSkillFolderHash(expected);
          args.copyHashCache.set(expected, copyHash);
        }
        links.push({
          agentId: agent.id,
          display: agent.display,
          dir,
          path: expected,
          state: 'copy',
          copyHash,
        });
        continue;
      }

      links.push({
        agentId: agent.id,
        display: agent.display,
        dir,
        path: expected,
        state: 'missing',
      });
    }

    // An agent with several candidate dirs resolves the skill through any one
    // of them, so report "missing" once — at the highest-priority dir — only
    // when none of the candidates contains it.
    if (!found && fallback) {
      links.push({
        agentId: fallback.agent.id,
        display: fallback.agent.display,
        dir: fallback.dir,
        path: join(fallback.dir, args.dirName),
        state: 'missing',
      });
    }
  }

  return links;
}
