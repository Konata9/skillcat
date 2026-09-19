/**
 * Project discovery: breadth-first walk of the configured roots looking for
 * skill markers (`.agents/skills`, `skills-lock.json`, …). Noise directories
 * such as node_modules and build output are skipped.
 */
import { basename, join } from 'node:path';
import { AGENTS } from './agents.js';
import { readLock } from './discovery.js';
import { isDirectory, pathExists, readdirSafe, safeRealpath } from './fs-utils.js';
import { expandHome, getProjectLockPath, getProjectSkillsDir, isGlobalSkillDir } from './paths.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.cache', '.turbo',
  'vendor', 'coverage', 'target', 'Pods', '.venv', 'venv', '__pycache__', '.idea',
  '.vscode', 'Library', '.Trash', 'tmp', 'temp', '.pnpm-store', '.yarn',
]);

// Derived from the agent registry so a newly registered agent dir is also a
// project discovery marker. Hidden dirs only: bare `skills/` is handled by
// `hasGenericSkillsDir`, which additionally requires a SKILL.md inside.
const DIR_MARKERS = [
  ...new Set(AGENTS.flatMap((agent) => agent.projectDirs).filter((dir) => dir.startsWith('.'))),
];

export interface DiscoveredProject {
  path: string;
  name: string;
  markers: string[];
  skillCount: number | null;
}

export interface DiscoverProjectsOptions {
  maxDepth?: number;
  /** Extra project-relative skill dirs from the config; global entries are ignored. */
  customSkillDirs?: string[];
}

export async function discoverProjects(
  roots: string[],
  options: DiscoverProjectsOptions = {},
): Promise<DiscoveredProject[]> {
  const maxDepth = options.maxDepth ?? 3;
  const extraMarkers = (options.customSkillDirs ?? []).filter(
    (entry) => !isGlobalSkillDir(entry),
  );
  const dirMarkers = [...new Set([...DIR_MARKERS, ...extraMarkers])];
  const found = new Map<string, DiscoveredProject>();
  const visited = new Set<string>();
  const queue: Array<{ dir: string; depth: number }> = roots
    .filter((root): root is string => typeof root === 'string' && root.length > 0)
    .map((root) => ({ dir: expandHome(root), depth: 0 }));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const real = (await safeRealpath(current.dir)) ?? current.dir;
    if (visited.has(real)) continue;
    visited.add(real);
    if (!(await isDirectory(real))) continue;

    const markers: string[] = [];
    if (await pathExists(getProjectLockPath(real))) markers.push('skills-lock.json');
    for (const marker of dirMarkers) {
      if (await isDirectory(join(real, marker))) markers.push(marker);
    }
    if (!markers.includes('.agents/skills') && (await hasGenericSkillsDir(real))) {
      markers.push('skills');
    }

    if (markers.length > 0) {
      found.set(real, {
        path: real,
        name: basename(real),
        markers,
        skillCount: await countSkills(real),
      });
      continue;
    }

    if (current.depth >= maxDepth) continue;
    const entries = await readdirSafe(real, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      queue.push({ dir: join(real, entry.name), depth: current.depth + 1 });
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function hasGenericSkillsDir(root: string): Promise<boolean> {
  const skillsDir = join(root, 'skills');
  if (!(await isDirectory(skillsDir))) return false;
  const entries = await readdirSafe(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (
      (await pathExists(join(skillsDir, entry.name, 'SKILL.md'))) ||
      (await pathExists(join(skillsDir, entry.name, 'skill.md')))
    ) {
      return true;
    }
  }
  return false;
}

async function countSkills(root: string): Promise<number | null> {
  const canonical = getProjectSkillsDir(root);
  if (await isDirectory(canonical)) {
    const entries = await readdirSafe(canonical, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (
        (await pathExists(join(canonical, entry.name, 'SKILL.md'))) ||
        (await pathExists(join(canonical, entry.name, 'skill.md')))
      ) {
        count += 1;
      }
    }
    return count;
  }
  if (await pathExists(getProjectLockPath(root))) {
    const lock = await readLock(getProjectLockPath(root));
    return Object.keys(lock.skills).length;
  }
  return null;
}
