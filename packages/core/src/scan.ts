/**
 * Scan pipeline: scans the global scope plus every registered / discovered /
 * requested project and returns the combined records. Extracted from
 * `SkillManager` so the facade only orchestrates state, not filesystem walks.
 */
import type { SkillsCli } from './cli/skills-cli.js';
import { scanScope } from './discovery.js';
import { toErrorMessage } from './coerce.js';
import { discoverProjects } from './projects.js';
import type { AnnotationsFile, OrphanLock, SkillRecord } from './types.js';

export interface ScanInput {
  cli: SkillsCli | null;
  annotations: AnnotationsFile;
  showInternal: boolean;
  roots: string[];
  maxDepth: number;
  customSkillDirs: string[];
  /** Paths explicitly registered in the config. */
  registeredProjects: string[];
  /** Extra paths requested for this scan only (e.g. a freshly added project). */
  extraProjectPaths?: string[];
  deep?: boolean;
  copyHashCache: Map<string, string>;
}

export interface ScanResult {
  global: SkillRecord[];
  projects: Map<string, SkillRecord[]>;
  orphans: OrphanLock[];
  errors: Map<string, string>;
  all: SkillRecord[];
}

export async function scanAll(input: ScanInput): Promise<ScanResult> {
  const globalScan = await scanScope({
    scope: 'global',
    cli: input.cli,
    annotations: input.annotations,
    showInternal: input.showInternal,
    deep: input.deep,
    copyHashCache: input.copyHashCache,
    customSkillDirs: input.customSkillDirs,
  });

  const discovered = await discoverProjects(input.roots, {
    maxDepth: input.maxDepth,
    customSkillDirs: input.customSkillDirs,
  });
  const projectPaths = new Set<string>([
    ...input.registeredProjects,
    ...discovered.map((entry) => entry.path),
    ...(input.extraProjectPaths ?? []),
  ]);

  const projects = new Map<string, SkillRecord[]>();
  const errors = new Map<string, string>();
  const orphans: OrphanLock[] = [...globalScan.orphans];

  for (const path of projectPaths) {
    try {
      const scan = await scanScope({
        scope: 'project',
        root: path,
        cli: input.cli,
        annotations: input.annotations,
        showInternal: input.showInternal,
        deep: input.deep,
        copyHashCache: input.copyHashCache,
        customSkillDirs: input.customSkillDirs,
      });
      projects.set(path, scan.records);
      orphans.push(...scan.orphans);
      if (scan.error) errors.set(path, scan.error);
    } catch (error) {
      errors.set(path, toErrorMessage(error));
    }
  }

  const all = [...globalScan.records, ...[...projects.values()].flat()];
  return { global: globalScan.records, projects, orphans, errors, all };
}
