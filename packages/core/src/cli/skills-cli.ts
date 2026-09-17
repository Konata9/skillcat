/**
 * Thin adapter around the `skills` CLI: `list` parses `ls --json`, `run` spawns
 * a streaming operation (merged stdout/stderr lines + final result + cancel).
 * All validation of CLI output happens here, never in the UI.
 */
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { execa } from 'execa';
import { z } from 'zod';
import type { AsyncOp, CliSkill, Scope } from '../types.js';
import { cleanOutputLine } from './ansi.js';

const CliSkillSchema = z.object({
  name: z.string(),
  path: z.string(),
  scope: z.string(),
  agents: z.array(z.string()).nullish(),
  source: z.string().nullish(),
  sourceUrl: z.string().nullish(),
  sourceType: z.string().nullish(),
});

const CliSkillListSchema = z.array(CliSkillSchema);

export class SkillsCliError extends Error {
  constructor(
    message: string,
    readonly stdout = '',
    readonly stderr = '',
    readonly code: number | null = null,
  ) {
    super(message);
    this.name = 'SkillsCliError';
  }
}

export interface SkillsCliOptions {
  /**
   * Extra environment merged into every child process. The manager puts the
   * configured proxy vars here, so `npx skills`, its internal fetch calls and
   * the git clones it spawns all share one route out.
   */
  env?: Record<string, string>;
}

export class SkillsCli {
  private readonly extraEnv: Record<string, string>;

  constructor(
    readonly command: string[],
    options: SkillsCliOptions = {},
  ) {
    this.extraEnv = options.env ?? {};
  }

  private get bin(): string {
    if (!this.command[0]) throw new SkillsCliError('skills command is not configured');
    return this.command[0];
  }

  private args(args: string[]): string[] {
    return [...this.command.slice(1), ...args];
  }

  private childEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
    return { ...process.env, ...this.extraEnv, ...overrides };
  }

  async version(): Promise<string | null> {
    try {
      const result = await execa(this.bin, this.args(['--version']), {
        timeout: 30_000,
        reject: false,
        env: this.childEnv(),
      });
      if (result.exitCode !== 0) return null;
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  async list(opts: { global?: boolean; cwd?: string } = {}): Promise<CliSkill[]> {
    const args = ['ls', '--json'];
    if (opts.global) args.push('-g');
    const result = await execa(this.bin, this.args(args), {
      cwd: opts.cwd,
      timeout: 60_000,
      reject: false,
      env: this.childEnv({ NO_COLOR: '1' }),
    });
    if (result.exitCode !== 0) {
      throw new SkillsCliError(
        `skills ls failed with code ${result.exitCode}`,
        result.stdout,
        result.stderr,
        result.exitCode,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      throw new SkillsCliError(
        `skills ls returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        result.stdout,
        result.stderr,
      );
    }
    const skills = CliSkillListSchema.parse(parsed);
    return skills.map((skill) => ({
      name: skill.name,
      path: skill.path,
      scope: (skill.scope === 'global' ? 'global' : 'project') as Scope,
      agents: (skill.agents ?? []).filter((item): item is string => typeof item === 'string'),
      source: skill.source ?? null,
      sourceUrl: skill.sourceUrl ?? null,
      sourceType: skill.sourceType ?? null,
    }));
  }

  run(args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): AsyncOp {
    const id = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const child = execa(this.bin, this.args(args), {
      cwd: opts.cwd,
      reject: false,
      timeout: opts.timeoutMs ?? 10 * 60_000,
      forceKillAfterDelay: 3000,
      env: this.childEnv({
        NO_COLOR: '1',
        GIT_TERMINAL_PROMPT: '0',
      }),
    });

    const lines = mergeStreams(child.stdout, child.stderr);
    const result = child
      .then((value) => ({ ok: value.exitCode === 0, code: value.exitCode ?? null }))
      .catch(() => ({ ok: false, code: null }));

    return {
      id,
      title: args.join(' '),
      lines,
      result,
      cancel: () => {
        try {
          child.kill('SIGTERM');
        } catch {
          // already exited
        }
      },
    };
  }
}

async function* mergeStreams(
  stdout: Readable | null | undefined,
  stderr: Readable | null | undefined,
): AsyncGenerator<string> {
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let open = 0;

  const push = (line: string) => {
    queue.push(cleanOutputLine(line));
    wake?.();
    wake = null;
  };

  const close = () => {
    open -= 1;
    if (open <= 0) {
      wake?.();
      wake = null;
    }
  };

  const readers = [stdout, stderr].filter((stream): stream is Readable => Boolean(stream));
  const interfaces = readers.map((stream) => {
    open += 1;
    const rl = createInterface({ input: stream });
    rl.on('line', push);
    rl.on('close', close);
    return rl;
  });

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (open <= 0) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    for (const rl of interfaces) rl.close();
  }
}
