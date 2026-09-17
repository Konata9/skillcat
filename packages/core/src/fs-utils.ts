/**
 * Small, dependency-free filesystem helpers. Every probe is "safe": a missing
 * or unreadable path yields null/empty instead of throwing, so scanning a large
 * directory tree never aborts on one bad entry.
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

export const SKIP_DIRS = new Set(['.git', 'node_modules']);

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function lstatSafe(path: string) {
  try {
    return await lstat(path);
  } catch {
    return null;
  }
}

export async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

export async function readdirSafe(
  path: string,
  options: { withFileTypes: true },
): Promise<import('node:fs').Dirent[]> {
  try {
    return await readdir(path, options);
  } catch {
    return [];
  }
}

export async function readlinkSafe(path: string): Promise<string | null> {
  try {
    const { readlink } = await import('node:fs/promises');
    return await readlink(path);
  } catch {
    return null;
  }
}

export async function readJsonSafe<T>(path: string): Promise<T | null> {
  const raw = await readFileSafe(path);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function atomicWriteFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export interface WalkedFile {
  relativePath: string;
  absolutePath: string;
  size: number;
}

export async function walkFiles(
  baseDir: string,
  currentDir: string = baseDir,
  results: WalkedFile[] = [],
): Promise<WalkedFile[]> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walkFiles(baseDir, fullPath, results);
    } else if (entry.isFile()) {
      let size = 0;
      try {
        size = (await stat(fullPath)).size;
      } catch {
        continue;
      }
      results.push({
        relativePath: relative(baseDir, fullPath).split('\\').join('/'),
        absolutePath: fullPath,
        size,
      });
    }
  }
  return results;
}

/**
 * Replicates the skills CLI `computeSkillFolderHash`:
 * sha256 over `relativePath + fileContent` for every file, sorted by localeCompare,
 * skipping `.git` and `node_modules`.
 */
export async function computeSkillFolderHash(skillDir: string): Promise<string> {
  const files: Array<{ relativePath: string; content: Buffer }> = [];
  await collectContents(skillDir, skillDir, files);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(file.content);
  }
  return hash.digest('hex');
}

async function collectContents(
  baseDir: string,
  currentDir: string,
  results: Array<{ relativePath: string; content: Buffer }>,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) return;
        await collectContents(baseDir, fullPath, results);
      } else if (entry.isFile()) {
        try {
          const content = await readFile(fullPath);
          results.push({
            relativePath: relative(baseDir, fullPath).split('\\').join('/'),
            content,
          });
        } catch {
          // unreadable file: skip, same as a missing file
        }
      }
    }),
  );
}

export async function safeRealpath(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}
