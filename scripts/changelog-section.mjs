#!/usr/bin/env node
//
// Extracts one version's section from CHANGELOG.md so the release workflow can
// use it as the GitHub release body. A release shows only the changes between
// that version and the previous one — never the whole changelog.
//
// Usage:
//   node scripts/changelog-section.mjs [version] [--out <file>]
//
// `version` defaults to the root package.json version. When the exact version
// has no section yet (the maintainer bumped package.json but has not renamed
// the section), the `Unreleased` section is used as the fallback. Sets
// `found=true|false` on $GITHUB_OUTPUT when running inside GitHub Actions.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
let version = '';
let outPath = 'release-notes.md';
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') {
    outPath = args[i + 1] ?? outPath;
    i += 1;
  } else if (!version) {
    version = args[i];
  }
}
if (!version) {
  version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
}

const lines = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);

/** Body of a `## [name]` section, trimmed; link definitions excluded. */
function section(name) {
  const start = lines.findIndex((line) => line.startsWith(`## [${name}]`));
  if (start === -1) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('## [') || /^\[[^\]]+\]:\s/.test(line)) break;
    body.push(line);
  }
  return body.join('\n').trim();
}

const body = section(version) ?? section('Unreleased');
if (!body) {
  writeFileSync(outPath, '');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'found=false\n');
  console.log(`[changelog-section] no section for ${version} or Unreleased`);
  process.exit(0);
}

writeFileSync(outPath, `${body}\n`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'found=true\n');
console.log(`[changelog-section] wrote release notes for ${version} to ${outPath}`);
