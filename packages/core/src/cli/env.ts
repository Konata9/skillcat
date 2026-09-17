/**
 * Resolves how to invoke the `skills` CLI: explicit config first, then PATH,
 * then a login shell (GUI apps on macOS do not inherit the shell PATH).
 */
import { execa } from 'execa';

export type CommandSource = 'config' | 'path' | 'login-shell' | 'none';

export interface ResolvedCommand {
  command: string[] | null;
  source: CommandSource;
  error?: string;
}

export async function resolveSkillsCommand(configured: string[] | null): Promise<ResolvedCommand> {
  if (configured && configured.length > 0) {
    return { command: configured, source: 'config' };
  }

  try {
    await execa('npx', ['--version'], { timeout: 20_000, reject: true });
    return { command: ['npx', '-y', 'skills'], source: 'path' };
  } catch {
    // fall through to login shell probing (GUI apps on macOS miss shell PATH)
  }

  const shell = process.env.SHELL ?? '/bin/zsh';
  try {
    const result = await execa(shell, ['-lic', 'command -v npx'], {
      timeout: 30_000,
      reject: false,
    });
    const found = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .pop();
    if (result.exitCode === 0 && found) {
      return { command: [found, '-y', 'skills'], source: 'login-shell' };
    }
  } catch {
    // ignore
  }

  return {
    command: null,
    source: 'none',
    error: 'npx not found in PATH or login shell; set skillsCommand in config',
  };
}
