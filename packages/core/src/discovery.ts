/**
 * Filesystem discovery: read the lock file, enumerate skill candidates across
 * the canonical dir and every agent dir, parse them and compute link states.
 * Read-only by design; an optional CLI pass can enrich declared agents.
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { AGENTS, type AgentDef } from './agents.js';
import type { SkillsCli } from './cli/skills-cli.js';
import {
  computeSkillFolderHash,
  isDirectory,
  lstatSafe,
  pathExists,
  readJsonSafe,
  readdirSafe,
  readlinkSafe,
  safeRealpath,
} from './fs-utils.js';
import { annotationKey } from './keys.js';
import {
  getGlobalLockPath,
  getGlobalSkillsDir,
  getProjectLockPath,
  getProjectSkillsDir,
} from './paths.js';
import { parseSkillDir } from './skill.js';
import { applyAnnotation } from './triggers.js';
import type {
  AgentLink,
  AnnotationsFile,
  LockEntry,
  OrphanLock,
  Scope,
  SkillRecord,
} from './types.js';

export interface LockFile {
  version: number;
  skills: Record<string, LockEntry>;
}

export async function readLock(path: string): Promise<LockFile> {
  const raw = await readJsonSafe<{ version?: unknown; skills?: unknown }>(path);
  if (!raw || typeof raw.skills !== 'object' || raw.skills === null) {
    return { version: 0, skills: {} };
  }
  const skills: Record<string, LockEntry> = {};
  for (const [name, entry] of Object.entries(raw.skills as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue;
    skills[name] = entry as LockEntry;
  }
  return {
    version: typeof raw.version === 'number' ? raw.version : 0,
    skills,
  };
}

export interface AgentDirInfo {
  agent: AgentDef;
  dir: string;
}

export async function collectAgentDirs(scope: Scope, root?: string): Promise<AgentDirInfo[]> {
  const base = scope === 'global' ? homedir() : root;
  if (!base) return [];
  const result: AgentDirInfo[] = [];
  for (const agent of AGENTS) {
    const relative = scope === 'global' ? agent.globalDir : agent.projectDir;
    if (!relative) continue;
    const dir = join(base, relative);
    if (await isDirectory(dir)) result.push({ agent, dir });
  }
  return result;
}

export interface ScanScopeOptions {
  scope: Scope;
  root?: string;
  cli?: SkillsCli | null;
  annotations: AnnotationsFile;
  showInternal: boolean;
  deep?: boolean;
  copyHashCache: Map<string, string>;
}

export interface ScanScopeResult {
  records: SkillRecord[];
  orphans: OrphanLock[];
  error?: string;
}

export async function scanScope(options: ScanScopeOptions): Promise<ScanScopeResult> {
  const root = options.root;
  const canonicalDir =
    options.scope === 'global' ? getGlobalSkillsDir() : getProjectSkillsDir(root!);
  const lockPath = options.scope === 'global' ? getGlobalLockPath() : getProjectLockPath(root!);
  const lock = await readLock(lockPath);
  const agentDirs = await collectAgentDirs(options.scope, root);

  const candidates = new Map<string, { dirName: string; path: string }>();
  const addCandidate = async (dirName: string, path: string) => {
    const real = (await safeRealpath(path)) ?? resolve(path);
    if (!candidates.has(real)) candidates.set(real, { dirName, path });
  };

  const scanDirs = [canonicalDir, ...agentDirs.map((item) => item.dir)];
  const seenDirs = new Set<string>();
  for (const dir of scanDirs) {
    const key = resolve(dir);
    if (seenDirs.has(key)) continue;
    seenDirs.add(key);
    const entries = await readdirSafe(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const skillDir = join(dir, entry.name);
      const hasSkillMd =
        (await pathExists(join(skillDir, 'SKILL.md'))) ||
        (await pathExists(join(skillDir, 'skill.md')));
      if (!hasSkillMd) continue;
      await addCandidate(entry.name, skillDir);
    }
  }

  const declaredByName = new Map<string, string[]>();
  if (options.deep && options.cli) {
    try {
      const cliSkills = await options.cli.list({
        global: options.scope === 'global',
        cwd: root,
      });
      const known = new Set([...candidates.values()].map((item) => resolve(item.path)));
      for (const skill of cliSkills) {
        declaredByName.set(skill.name, skill.agents);
        if (!known.has(resolve(skill.path))) {
          const hasSkillMd =
            (await pathExists(join(skill.path, 'SKILL.md'))) ||
            (await pathExists(join(skill.path, 'skill.md')));
          if (hasSkillMd) {
            await addCandidate(skill.name, skill.path);
            known.add(resolve(skill.path));
          }
        }
      }
    } catch {
      // CLI enrichment is best-effort
    }
  }

  const records: SkillRecord[] = [];
  for (const { dirName, path } of candidates.values()) {
    try {
      const parsed = await parseSkillDir(path, dirName);
      if (parsed.internal && !options.showInternal) continue;
      const contentHash = await computeSkillFolderHash(path);
      const links = await computeLinks({
        dirName,
        skillPath: path,
        canonicalDir,
        agentDirs,
        copyHashCache: options.copyHashCache,
      });
      const lockEntry = lock.skills[parsed.name] ?? lock.skills[dirName] ?? null;
      const triggers = applyAnnotation(
        parsed.triggers,
        options.annotations[
          annotationKey({
            scope: options.scope,
            projectPath: root,
            name: parsed.name,
            contentHash,
          })
        ],
      );

      records.push({
        name: parsed.name,
        scope: options.scope,
        path,
        projectPath: root,
        description: parsed.description,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        bodyTruncated: parsed.bodyTruncated,
        source: lockEntry?.source ?? null,
        sourceUrl: lockEntry?.sourceUrl ?? null,
        sourceType: lockEntry?.sourceType ?? null,
        agentsDeclared: declaredByName.get(parsed.name) ?? [],
        lock: lockEntry,
        links,
        contentHash,
        files: parsed.files,
        sizeBytes: parsed.sizeBytes,
        triggers,
        internal: parsed.internal,
        installedAt: lockEntry?.installedAt ?? null,
        updatedAt: lockEntry?.updatedAt ?? null,
        mtimeMs: parsed.mtimeMs,
      });
    } catch {
      // unreadable or invalid skill dir: skip
    }
  }

  const matched = new Set(records.map((record) => record.name));
  const orphans: OrphanLock[] = [];
  for (const [name, entry] of Object.entries(lock.skills)) {
    if (matched.has(name)) continue;
    orphans.push({
      name,
      scope: options.scope,
      projectPath: root,
      entry,
      expectedPath: join(canonicalDir, name),
    });
  }

  return { records, orphans };
}

async function computeLinks(args: {
  dirName: string;
  skillPath: string;
  canonicalDir: string;
  agentDirs: AgentDirInfo[];
  copyHashCache: Map<string, string>;
}): Promise<AgentLink[]> {
  const links: AgentLink[] = [];
  const canonicalPath = resolve(join(args.canonicalDir, args.dirName));
  const selfPath = resolve(args.skillPath);
  const seen = new Set<string>();

  for (const { agent, dir } of args.agentDirs) {
    const expected = join(dir, args.dirName);
    const key = `${agent.id}:${resolve(expected)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const resolvedExpected = resolve(expected);

    if (resolvedExpected === canonicalPath || resolvedExpected === selfPath) {
      links.push({
        agentId: agent.id,
        display: agent.display,
        dir,
        path: expected,
        state: 'canonical',
      });
      continue;
    }

    const stats = await lstatSafe(expected);
    if (!stats) {
      links.push({
        agentId: agent.id,
        display: agent.display,
        dir,
        path: expected,
        state: 'missing',
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

  return links;
}
