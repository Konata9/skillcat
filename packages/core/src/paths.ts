/**
 * Platform-aware path layout: config dir, global skills dir, lock files and
 * per-project paths. All other modules must resolve paths through this file.
 */
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export const APP_NAME = 'skillman';

export function expandHome(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith(`~${sep}`)) return join(homedir(), input.slice(2));
  return input;
}

export function getConfigDir(): string {
  const override = process.env.SKILLMAN_CONFIG_DIR;
  if (override) return resolve(expandHome(override));
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', APP_NAME);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, APP_NAME);
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(xdg, APP_NAME);
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
