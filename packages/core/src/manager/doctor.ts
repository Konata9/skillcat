/**
 * Diagnostic report builder for `SkillManager`: checks the skills CLI, proxy
 * and lock files, and returns warnings the settings UI can surface. Extracted
 * from the facade as a read-only collaborator.
 */
import { join } from 'node:path';
import { isValidProxyUrl, normalizeProxyUrl } from '../cli/proxy.js';
import type { ResolvedCommand } from '../cli/env.js';
import type { SkillsCli } from '../cli/skills-cli.js';
import type { ConfigStore } from '../config.js';
import { readLock } from '../discovery.js';
import { getGlobalLockPath, getProjectLockPath, logsDir } from '../paths.js';
import type { DoctorReport, DoctorWarning } from '../types.js';

export interface DoctorDeps {
  configStore: ConfigStore;
  cli: () => SkillsCli | null;
  resolved: () => ResolvedCommand | null;
}

export class DoctorService {
  constructor(private readonly deps: DoctorDeps) {}

  async report(): Promise<DoctorReport> {
    const warnings: DoctorWarning[] = [];
    const config = this.deps.configStore.value;
    const lockFiles: DoctorReport['lockFiles'] = [];

    const globalLock = getGlobalLockPath();
    const globalLockData = await readLock(globalLock);
    lockFiles.push({
      path: globalLock,
      ok: Object.keys(globalLockData.skills).length > 0 || globalLockData.version > 0,
      count: Object.keys(globalLockData.skills).length,
    });
    for (const entry of config.projects) {
      const path = getProjectLockPath(entry.path);
      const lock = await readLock(path);
      const count = Object.keys(lock.skills).length;
      if (count > 0) lockFiles.push({ path, ok: true, count });
    }

    const cli = this.deps.cli();
    const resolved = this.deps.resolved();
    let version: string | null = null;
    if (cli) {
      version = await cli.version();
      if (!version) warnings.push({ code: 'doctor.cliVersionFailed' });
    } else {
      warnings.push({
        code: 'doctor.cliUnavailable',
        params: { error: resolved?.error ?? 'unknown error' },
      });
    }
    if (config.roots.length === 0) warnings.push({ code: 'doctor.noRoots' });
    if (!isValidProxyUrl(config.proxy.url)) warnings.push({ code: 'doctor.invalidProxy' });

    return {
      ok: warnings.length === 0,
      configDir: this.deps.configStore.dir,
      logPath: join(logsDir(this.deps.configStore.dir), 'main.log'),
      cli: {
        command: resolved?.command ?? null,
        version,
        error: resolved?.error,
      },
      proxy: isValidProxyUrl(config.proxy.url) ? normalizeProxyUrl(config.proxy.url) : null,
      lockFiles,
      warnings,
    };
  }
}
