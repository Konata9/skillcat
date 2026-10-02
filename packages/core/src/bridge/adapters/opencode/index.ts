/**
 * OpenCode bridge adapter.
 *
 * OpenCode loads plugins from `~/.config/opencode/plugins/` and exposes a
 * `tool.execute.after` hook that fires for the native `skill` tool, plus an SDK
 * client that can read the session's last user message and its todo list. That
 * is enough to record: which skill loaded, the prompt that triggered it and the
 * task it belonged to.
 */
import { join } from 'node:path';
import { isDirectory } from '../../../fs-utils.js';
import type {
  BridgeAdapter,
  BridgeContext,
  BridgeDetection,
  BridgeInstallPlan,
  ParsedRuntimeEvent,
} from '../../../types.js';
import { buildOpencodePluginSource, OPENCODE_MARKER } from './plugin-template.js';

const PLUGIN_FILE = 'skillcat-bridge.ts';

function configDirPath(ctx: BridgeContext): string {
  return join(ctx.homeDir, '.config', 'opencode');
}

function pluginDirPath(ctx: BridgeContext): string {
  return join(configDirPath(ctx), 'plugins');
}

export const opencodeBridge: BridgeAdapter = {
  id: 'opencode',
  agentId: 'opencode',
  display: 'OpenCode',
  version: '1',

  async detect(ctx: BridgeContext): Promise<BridgeDetection> {
    const configDir = configDirPath(ctx);
    return {
      available: await isDirectory(configDir),
      targets: [pluginDirPath(ctx)],
    };
  },

  plan(ctx: BridgeContext): BridgeInstallPlan {
    return {
      marker: OPENCODE_MARKER,
      files: [
        {
          path: join(pluginDirPath(ctx), PLUGIN_FILE),
          content: buildOpencodePluginSource(ctx.spoolPath),
        },
      ],
    };
  },

  parse(raw: unknown): ParsedRuntimeEvent | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const record = raw as Record<string, unknown>;
    if (record.adapterId !== 'opencode') return null;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return null;

    const ts = typeof record.ts === 'number' && Number.isFinite(record.ts) ? record.ts : Date.now();
    const asText = (value: unknown): string | null =>
      typeof value === 'string' && value.trim() ? value.trim() : null;

    return {
      adapterId: 'opencode',
      skillName: name,
      path: asText(record.path),
      source: record.source === 'user' ? 'user' : 'model',
      phrase: asText(record.phrase),
      task: asText(record.task),
      taskId: asText(record.taskId),
      sessionId: asText(record.sessionId),
      cwd: asText(record.cwd),
      at: new Date(ts).toISOString(),
    };
  },
};
