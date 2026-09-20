/**
 * Resolves how to invoke the `skills` CLI.
 *
 * Precedence: explicit config → bundled CLI (shipped with the app) → PATH →
 * login shell (GUI apps on macOS do not inherit the shell PATH).
 */
import { existsSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { execa } from 'execa';

export type CommandSource = 'config' | 'bundled' | 'path' | 'login-shell' | 'none';

export interface ResolvedCommand {
  command: string[] | null;
  source: CommandSource;
  /**
   * Extra environment for the child process. The bundled CLI needs
   * `ELECTRON_RUN_AS_NODE`; the login-shell fallback puts the resolved Node bin
   * directory on PATH so that `npx`'s `#!/usr/bin/env node` shebang resolves
   * even though a GUI app starts with a minimal PATH.
   */
  env?: Record<string, string>;
  error?: string;
}

/** A `skills` CLI shipped with the app, run via Electron's own Node runtime. */
export interface BundledCli {
  /** Executable that behaves as Node when `ELECTRON_RUN_AS_NODE=1` is set. */
  node: string;
  /** Path to the `skills` package's `bin/cli.mjs`. */
  cli: string;
}

interface ExecResult {
  stdout: string;
  exitCode?: number | null;
}

/** Minimal execa surface so tests can inject a fake. */
export type ExecaLike = (
  file: string,
  args?: readonly string[],
  options?: Record<string, unknown>,
) => Promise<ExecResult>;

export interface ResolveOptions {
  execa?: ExecaLike;
  bundled?: BundledCli;
}

/**
 * Printed by the login shell. `whence -p` / `type -P` deliberately skip aliases
 * and functions (users often alias `npx`, e.g. `alias npx='https_proxy npx'`),
 * and `process.execPath` yields the real, stable Node binary rather than a
 * version-manager shim directory that disappears with the shell.
 */
const LOGIN_SHELL_PROBE = [
  'node_path="$(whence -p node 2>/dev/null || type -P node 2>/dev/null || command -v node 2>/dev/null)"',
  'case "$node_path" in /*) ;; *) node_path="" ;; esac',
  'exec_path=""',
  'if [ -n "$node_path" ]; then exec_path="$("$node_path" -e "process.stdout.write(process.execPath)" 2>/dev/null)"; fi',
  'printf "NODE=%s\\n" "$exec_path"',
  'printf "PATH=%s\\n" "$PATH"',
].join('; ');

function field(stdout: string, key: string): string {
  const prefix = `${key}=`;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
  }
  return '';
}

export async function resolveSkillsCommand(
  configured: string[] | null,
  options: ResolveOptions = {},
): Promise<ResolvedCommand> {
  if (configured && configured.length > 0) {
    return { command: configured, source: 'config' };
  }

  const execaImpl = options.execa ?? (execa as unknown as ExecaLike);
  const bundled = options.bundled;
  if (bundled && existsSync(bundled.node) && existsSync(bundled.cli)) {
    return {
      command: [bundled.node, bundled.cli],
      source: 'bundled',
      env: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  try {
    await execaImpl('npx', ['--version'], { timeout: 20_000, reject: true });
    return { command: ['npx', '-y', 'skills'], source: 'path' };
  } catch {
    // fall through to login shell probing (GUI apps on macOS miss shell PATH)
  }

  const shell = process.env.SHELL ?? '/bin/zsh';
  try {
    const result = await execaImpl(shell, ['-lic', LOGIN_SHELL_PROBE], {
      timeout: 30_000,
      reject: false,
    });
    if (result.exitCode === 0) {
      const shellPath = field(result.stdout, 'PATH');
      const nodePath = field(result.stdout, 'NODE');

      if (nodePath && isAbsolute(nodePath)) {
        const binDir = dirname(nodePath);
        const env: Record<string, string> = {
          PATH: [binDir, shellPath].filter(Boolean).join(delimiter),
        };
        const npx = join(binDir, 'npx');
        return {
          command: existsSync(npx) ? [npx, '-y', 'skills'] : ['npx', '-y', 'skills'],
          source: 'login-shell',
          env,
        };
      }

      if (shellPath) {
        return {
          command: ['npx', '-y', 'skills'],
          source: 'login-shell',
          env: { PATH: shellPath },
        };
      }
    }
  } catch {
    // ignore
  }

  return {
    command: null,
    source: 'none',
    error: 'skills CLI not available (bundled CLI missing and npx not found)',
  };
}
