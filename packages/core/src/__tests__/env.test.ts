import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSkillsCommand, type ExecaLike } from '../cli/env.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function makeTmpDir(files: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'skillcat-env-'));
  tmpDirs.push(dir);
  for (const name of files) await writeFile(join(dir, name), '');
  return dir;
}

function fakeExeca(handlers: {
  pathProbeOk: boolean;
  shellStdout?: string;
  shellExitCode?: number;
}): { impl: ExecaLike; calls: Array<{ file: string; args: readonly string[] }> } {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const impl: ExecaLike = async (file, args = []) => {
    calls.push({ file, args });
    if (file === 'npx') {
      if (handlers.pathProbeOk) return { stdout: '10.0.0' };
      throw new Error('npx not found');
    }
    return { stdout: handlers.shellStdout ?? '', exitCode: handlers.shellExitCode ?? 0 };
  };
  return { impl, calls };
}

describe('resolveSkillsCommand', () => {
  it('prefers an explicit configured command over the bundled CLI', async () => {
    const { impl, calls } = fakeExeca({ pathProbeOk: true });
    const dir = await makeTmpDir(['node', 'cli.mjs']);
    const result = await resolveSkillsCommand(['/custom/npx', 'skills'], {
      execa: impl,
      bundled: { node: join(dir, 'node'), cli: join(dir, 'cli.mjs') },
    });
    expect(result).toEqual({ command: ['/custom/npx', 'skills'], source: 'config' });
    expect(calls).toHaveLength(0);
  });

  it('prefers the bundled CLI over PATH', async () => {
    const { impl, calls } = fakeExeca({ pathProbeOk: true });
    const dir = await makeTmpDir(['node', 'cli.mjs']);
    const node = join(dir, 'node');
    const cli = join(dir, 'cli.mjs');

    const result = await resolveSkillsCommand(null, { execa: impl, bundled: { node, cli } });
    expect(result.source).toBe('bundled');
    expect(result.command).toEqual([node, cli]);
    expect(result.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
    expect(calls).toHaveLength(0);
  });

  it('falls back to PATH when the bundled CLI is missing', async () => {
    const { impl } = fakeExeca({ pathProbeOk: true });
    const result = await resolveSkillsCommand(null, {
      execa: impl,
      bundled: { node: '/nope/node', cli: '/nope/cli.mjs' },
    });
    expect(result.source).toBe('path');
    expect(result.command).toEqual(['npx', '-y', 'skills']);
  });

  it('uses npx from PATH when available', async () => {
    const { impl } = fakeExeca({ pathProbeOk: true });
    const result = await resolveSkillsCommand(null, { execa: impl });
    expect(result.source).toBe('path');
    expect(result.command).toEqual(['npx', '-y', 'skills']);
  });

  it('falls back to the login shell and resolves the real node/npx', async () => {
    const dir = await makeTmpDir(['node', 'npx']);
    const { impl } = fakeExeca({
      pathProbeOk: false,
      shellStdout: `NODE=${join(dir, 'node')}\nPATH=/usr/bin:/bin\n`,
    });

    const result = await resolveSkillsCommand(null, { execa: impl });
    expect(result.source).toBe('login-shell');
    expect(result.command).toEqual([join(dir, 'npx'), '-y', 'skills']);
    expect(result.env?.PATH.startsWith(dir)).toBe(true);
  });

  it('ignores alias lines and uses the login-shell PATH when node is unresolved', async () => {
    const { impl } = fakeExeca({
      pathProbeOk: false,
      shellStdout: "alias npx='https_proxy npx'\nNODE=\nPATH=/opt/homebrew/bin:/usr/bin\n",
    });

    const result = await resolveSkillsCommand(null, { execa: impl });
    expect(result.source).toBe('login-shell');
    expect(result.command).toEqual(['npx', '-y', 'skills']);
    expect(result.env?.PATH).toBe('/opt/homebrew/bin:/usr/bin');
  });

  it('reports none when nothing resolves', async () => {
    const { impl } = fakeExeca({ pathProbeOk: false, shellStdout: '', shellExitCode: 1 });
    const result = await resolveSkillsCommand(null, { execa: impl });
    expect(result.source).toBe('none');
    expect(result.command).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
