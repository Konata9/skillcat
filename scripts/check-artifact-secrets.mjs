#!/usr/bin/env node
//
// Release guard: fail if a built artifact contains user config or credentials.
//
// The app is local-first — user settings (including LLM API keys) live in the
// per-user config directory and are never bundled. This script enforces that
// invariant by scanning the built output, the desktop manifest and every
// packaged `app.asar` for forbidden files and secret-looking values. Run it
// after a build, before publishing.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const FILE_TARGETS = ['apps/desktop/out', 'apps/desktop/package.json'];
const ASAR_ROOTS = ['apps/desktop/release'];

const FORBIDDEN = [
  { name: 'user config file', re: /(^|\/)(config|annotations|state|evaluation)\.json$/ },
  { name: 'environment file', re: /(^|\/)\.env(\.|$)/ },
];

const SECRETS = [
  // Long, separator-free keys (legacy OpenAI, DeepSeek, …).
  { name: 'OpenAI/DeepSeek-style API key', re: /sk-[A-Za-z0-9]{28,}/ },
  // Dashed key formats (OpenAI project, Anthropic, OpenRouter).
  { name: 'prefixed API key', re: /sk-(?:proj|ant|or)-[A-Za-z0-9_-]{24,}/ },
  { name: 'generic long API key', re: /sk-[A-Za-z0-9_-]{30,}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: 'AWS access key id', re: /AKIA[0-9A-Z]{16}/ },
];

const failures = [];

const toPosix = (p) => p.split(sep).join('/');

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function scanBytes(file) {
  const text = readFileSync(file).toString('latin1');
  for (const { name, re } of SECRETS) {
    const match = re.exec(text);
    if (match) {
      failures.push(`${file}: contains a ${name} (starts with "${match[0].slice(0, 5)}…")`);
    }
  }
}

for (const target of FILE_TARGETS) {
  if (!existsSync(target)) {
    failures.push(`missing build output: ${target} (build before running this check)`);
    continue;
  }
  const stat = statSync(target);
  const files = stat.isDirectory() ? walk(target) : [target];
  for (const file of files) {
    const rel = toPosix(relative(process.cwd(), file));
    for (const { name, re } of FORBIDDEN) {
      if (re.test(rel)) failures.push(`${file}: forbidden ${name}`);
    }
    scanBytes(file);
  }
}

for (const root of ASAR_ROOTS) {
  if (!existsSync(root)) continue;
  for (const file of walk(root)) {
    if (file.endsWith('app.asar')) scanBytes(file);
  }
}

if (failures.length > 0) {
  console.error('Artifact secret check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Artifact secret check passed: no user config or credentials found.');
