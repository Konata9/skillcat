import { getLogger, type SkillManager } from '@skillcat/core';

/**
 * Startup sequence for the Electron main process: load config, resolve the
 * skills CLI, then take the first scan so the window opens with data instead of
 * an empty list. A failed scan must not prevent the app from starting.
 */
export async function bootstrap(manager: SkillManager): Promise<void> {
  await manager.init();
  try {
    await manager.refresh();
  } catch (error) {
    getLogger().error('initial scan failed', error instanceof Error ? error.message : String(error));
  }
}
