#!/usr/bin/env node
//
// Syncs the project version (root package.json) into the desktop app package.
//
// Electron's `app.getVersion()` and electron-builder both read
// apps/desktop/package.json, while the project version is declared once in the
// root package.json. Running this before a build keeps them in lockstep so the
// in-app version, the artifact names and the release tag all agree.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appPath = join(root, 'apps/desktop/package.json');

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (typeof version !== 'string' || version.length === 0) {
  console.error('[sync-app-version] root package.json has no version');
  process.exit(1);
}

const raw = readFileSync(appPath, 'utf8');
const current = JSON.parse(raw).version;
if (current === version) {
  console.log(`[sync-app-version] already in sync: ${version}`);
  process.exit(0);
}

// Replace only the first "version" field to preserve the file's formatting.
const updated = raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
if (updated === raw) {
  console.error('[sync-app-version] could not find "version" in apps/desktop/package.json');
  process.exit(1);
}

writeFileSync(appPath, updated);
console.log(`[sync-app-version] ${current} -> ${version}`);
