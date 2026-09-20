/**
 * Platform-aware path layout: config dir, global skills dir, lock files and
 * per-project paths. All other modules must resolve paths through this file.
 */
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

export const APP_NAME = 'skillcat';

/** Previous product name; used once to migrate an existing config dir. */
export const LEGACY_APP_NAME = 'skillman';

export function expandHome(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith(`~${sep}`)) return join(homedir(), input.slice(2));
  return input;
}

/**
 * A user-configured skill dir is global when it is home-relative (`~…`) or
 * absolute; every other entry is resolved against a project root.
 */
export function isGlobalSkillDir(entry: string): boolean {
  return entry.startsWith('~') || isAbsolute(entry);
}

/** Resolves a configured skill dir against `base` for project-relative entries. */
export function resolveSkillDir(entry: string, base: string): string {
  if (isAbsolute(entry)) return resolve(entry);
  if (entry.startsWith('~')) return resolve(expandHome(entry));
  return join(base, entry);
}

function defaultConfigDirFor(name: string): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', name);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, name);
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(xdg, name);
}

export function getConfigDir(): string {
  // `SKILLMAN_CONFIG_DIR` is still honored for setups from before the rename.
  const override = process.env.SKILLCAT_CONFIG_DIR ?? process.env.SKILLMAN_CONFIG_DIR;
  if (override) return resolve(expandHome(override));
  return defaultConfigDirFor(APP_NAME);
}

export function getLegacyConfigDir(): string {
  return defaultConfigDirFor(LEGACY_APP_NAME);
}

export function getGlobalSkillsDir(): string {
  return join(homedir(), '.agents', 'skills');
}

export function getGlobalLockPath(): string {
  const xdgState = process.env.XDG_STATE_HOME;
  if (xdgState) return join(xdgState, 'skills', '.skill-lock.json');
  return join(homedir(), '.agents', '.skill-lock.json');
}

export function getProjectLockPath(root: string): string {
  return join(root, 'skills-lock.json');
}

export function getProjectSkillsDir(root: string): string {
  return join(root, '.agents', 'skills');
}

export function configFilePath(configDir: string): string {
  return join(configDir, 'config.json');
}

export function stateFilePath(configDir: string): string {
  return join(configDir, 'state.json');
}

export function annotationsFilePath(configDir: string): string {
  return join(configDir, 'annotations.json');
}

export function evaluationFilePath(configDir: string): string {
  return join(configDir, 'evaluation.json');
}
