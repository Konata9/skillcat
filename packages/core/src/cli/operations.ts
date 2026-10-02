/**
 * `skills` CLI operation builders. Each returns an `AsyncOp` the UI can stream
 * and cancel; `SkillManager` only resolves the CLI and delegates here.
 */
import type { AddTarget, AsyncOp, OpResult, Scope } from '../types.js';
import type { SkillsCli } from './skills-cli.js';

/**
 * Installs a skill into one or more targets. A single target maps to one CLI
 * run; multiple targets run sequentially inside one operation so the UI shows a
 * single stream and one final result.
 */
export function runAdd(cli: SkillsCli, source: string, targets: AddTarget[]): AsyncOp {
  const runOne = (target: AddTarget): AsyncOp => {
    const args = ['add', source, '-y'];
    if (target.scope === 'global') args.push('-g');
    args.push('-s', '*', '-a', '*');
    return cli.run(args, { cwd: target.cwd });
  };

  if (targets.length <= 1) {
    return runOne(targets[0] ?? { scope: 'global' });
  }

  const id = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let current: AsyncOp | null = null;
  let cancelled = false;
  let settle!: (result: OpResult) => void;
  const result = new Promise<OpResult>((resolve) => {
    settle = resolve;
  });

  const lines = (async function* () {
    let ok = true;
    let code: number | null = 0;
    try {
      for (const target of targets) {
        if (cancelled) {
          ok = false;
          code = null;
          break;
        }
        yield `# ${target.scope === 'global' ? 'global' : (target.cwd ?? 'project')}`;
        const op = runOne(target);
        current = op;
        for await (const line of op.lines) yield line;
        const outcome = await op.result;
        if (!outcome.ok) {
          ok = false;
          code = outcome.code;
        }
      }
    } finally {
      current = null;
      settle({ ok, code });
    }
  })();

  return {
    id,
    title: `add ${source}`,
    lines,
    result,
    cancel: () => {
      cancelled = true;
      current?.cancel();
    },
  };
}

export function runRemove(
  cli: SkillsCli,
  name: string,
  options: { scope: Scope; cwd?: string },
): AsyncOp {
  const args = ['remove', name, '-y'];
  if (options.scope === 'global') args.push('-g');
  return cli.run(args, { cwd: options.cwd });
}

export function runUpdate(
  cli: SkillsCli,
  names: string[],
  options: { scope: Scope; cwd?: string },
): AsyncOp {
  const args = ['update', ...names, '-y'];
  args.push(options.scope === 'global' ? '-g' : '-p');
  return cli.run(args, { cwd: options.cwd });
}

export function runInit(cli: SkillsCli, name: string | null, cwd: string): AsyncOp {
  const args = ['init'];
  if (name) args.push(name);
  return cli.run(args, { cwd });
}
