#!/usr/bin/env node
//
// Stages the `skills` CLI and its runtime dependency closure into
// apps/desktop/resources/skills-cli, so the packaged app can run it with its
// own Electron-as-Node runtime instead of relying on a system Node install.
//
// The `skills` package ships pre-bundled (vendored libs) and only needs `tar`
// and `yaml` at runtime; we copy the whole resolved closure flat so Node's
// module resolution works from the staged tree.
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'apps', 'desktop');
const outDir = join(appDir, 'resources', 'skills-cli');
const outModules = join(outDir, 'node_modules');

const require = createRequire(pathToFileURL(join(appDir, 'package.json')).href);

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function resolvePackageDir(name, fromDir) {
  try {
    return dirname(require.resolve(`${name}/package.json`, { paths: [fromDir] }));
  } catch {
    return null;
  }
}

async function collectClosure(entry) {
  const entryDir = resolvePackageDir(entry, appDir);
  if (!entryDir) throw new Error(`cannot resolve "${entry}" from ${appDir}`);

  const packages = new Map();
  const queue = [{ name: entry, dir: entryDir }];
  while (queue.length > 0) {
    const { name, dir } = queue.shift();
    if (packages.has(name)) continue;
    packages.set(name, dir);

    const pkg = await readJson(join(dir, 'package.json'));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
    for (const dep of Object.keys(deps)) {
      if (packages.has(dep)) continue;
      const depDir = resolvePackageDir(dep, dir);
      if (depDir) queue.push({ name: dep, dir: depDir });
    }
  }
  return packages;
}

const packages = await collectClosure('skills');

await rm(outDir, { recursive: true, force: true });
for (const [name, dir] of packages) {
  const dest = join(outModules, ...name.split('/'));
  await mkdir(dirname(dest), { recursive: true });
  await cp(dir, dest, { recursive: true, dereference: true });
}

console.log(
  `[bundle-skills-cli] staged ${packages.size} package(s) -> ${outDir.replace(`${root}/`, '')}`,
);
