import { describe, expect, it } from 'vitest';
import { cleanOutputLine, stripAnsi } from '../cli/ansi.js';
import { parseFindOutput } from '../cli/remote-search.js';
import { SkillsCli } from '../cli/skills-cli.js';

// The exact constants the skills CLI hardcodes in its update/install output.
const TEXT = '\u001B[38;5;145m';
const DIM = '\u001B[38;5;102m';
const RESET = '\u001B[0m';

describe('stripAnsi', () => {
  it('removes the escape sequences the skills CLI emits', () => {
    expect(stripAnsi(`${TEXT}Updating chinese-novelist…${RESET}`)).toBe(
      'Updating chinese-novelist…',
    );
    expect(stripAnsi(`  ${DIM}✓${RESET} Updated chinese-novelist`)).toBe(
      '  ✓ Updated chinese-novelist',
    );
  });

  it('removes OSC and simple escapes too', () => {
    expect(stripAnsi('\u001B]0;title\u0007plain')).toBe('plain');
    expect(stripAnsi('\u001B(Bplain')).toBe('plain');
  });
});

describe('cleanOutputLine', () => {
  it('resolves carriage-return rewrites the way a terminal would', () => {
    expect(cleanOutputLine('Downloading 10%\rDownloading 100%')).toBe('Downloading 100%');
    expect(cleanOutputLine('   \rDone')).toBe('Done');
  });

  it('trims trailing whitespace but keeps indentation', () => {
    expect(cleanOutputLine(`  ${TEXT}Updated${RESET}   `)).toBe('  Updated');
  });
});

describe('parseFindOutput on coloured input', () => {
  it('parses lines wrapped in escape sequences', () => {
    const stdout = [
      `${DIM}Install with npx skills add <owner/repo@skill>${RESET}`,
      '',
      `${TEXT}vercel-labs/agent-skills@frontend-design${RESET} 12K installs`,
      `${DIM}└ https://skills.sh/vercel-labs/agent-skills/frontend-design${RESET}`,
    ].join('\n');

    const results = parseFindOutput(stripAnsi(stdout));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: 'frontend-design',
      source: 'vercel-labs/agent-skills',
      installs: 12000,
    });
  });
});

describe('SkillsCli.run', () => {
  it('streams plain text even when the child writes escape sequences', async () => {
    const cli = new SkillsCli([
      'node',
      '-e',
      "process.stdout.write('\\u001B[38;5;145mUpdating demo\\u2026\\u001B[0m\\n')",
    ]);

    const op = cli.run([]);
    const lines: string[] = [];
    for await (const line of op.lines) lines.push(line);
    const result = await op.result;

    expect(result.ok).toBe(true);
    expect(lines).toEqual(['Updating demo…']);
  });
});
