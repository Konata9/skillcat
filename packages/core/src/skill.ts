/**
 * SKILL.md parsing: frontmatter extraction (YAML), description/name coercion,
 * file inventory and trigger-profile extraction for a single skill directory.
 */
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { coerceString, coerceTrimmed, toErrorMessage } from './coerce.js';
import { pathExists, readFileSafe, walkFiles, type WalkedFile } from './fs-utils.js';
import { extractTriggers } from './triggers.js';
import type { SkillFileInfo, TriggerProfile } from './types.js';

export interface ParsedSkill {
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  body: string;
  bodyTruncated: boolean;
  internal: boolean;
  triggers: TriggerProfile;
  files: SkillFileInfo[];
  sizeBytes: number;
  mtimeMs: number;
  skillMdPath: string;
}

const MAX_BODY_CHARS = 24_000;

export interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string;
  error?: string;
}

export function parseFrontmatter(raw: string): FrontmatterResult {
  const text = raw.replace(/^\uFEFF/, '');
  if (!/^---\r?\n/.test(text)) {
    return { data: {}, content: text };
  }
  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line === '---' || line === '...') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { data: {}, content: text, error: 'unterminated frontmatter' };
  }
  const yamlText = lines.slice(1, end).join('\n');
  const content = lines.slice(end + 1).join('\n');
  try {
    const parsed = parseYaml(yamlText);
    if (parsed === null || parsed === undefined) return { data: {}, content };
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, content, error: 'frontmatter is not a mapping' };
    }
    return { data: parsed as Record<string, unknown>, content };
  } catch (error) {
    return {
      data: {},
      content,
      error: toErrorMessage(error),
    };
  }
}

function fileKind(relativePath: string): SkillFileInfo['kind'] {
  const lower = relativePath.toLowerCase();
  if (lower === 'skill.md') return 'skill-md';
  if (lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.txt')) return 'markdown';
  if (/\.(sh|bash|zsh|fish|js|mjs|cjs|ts|tsx|py|rb|go|rs|pl|lua)$/.test(lower)) return 'script';
  if (/\.(json|ya?ml|toml|csv|tsv|ini|env)$/.test(lower)) return 'data';
  return 'other';
}

export function buildFileInfos(files: WalkedFile[]): SkillFileInfo[] {
  return files
    .map((file) => ({
      relativePath: file.relativePath,
      size: file.size,
      kind: fileKind(file.relativePath),
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

const SKILL_MD_CANDIDATES = ['SKILL.md', 'skill.md', 'Skill.md'] as const;

/** Reads the first SKILL.md variant in `dir` without probing twice. */
async function readSkillMd(dir: string): Promise<{ path: string; content: string } | null> {
  for (const candidate of SKILL_MD_CANDIDATES) {
    const path = join(dir, candidate);
    const content = await readFileSafe(path);
    if (content !== null) return { path, content };
  }
  return null;
}

/** Cheap existence probe for discovery, before parsing the file. */
export async function hasSkillMd(dir: string): Promise<boolean> {
  for (const candidate of SKILL_MD_CANDIDATES) {
    if (await pathExists(join(dir, candidate))) return true;
  }
  return false;
}

export async function parseSkillDir(dir: string, fallbackName?: string): Promise<ParsedSkill> {
  const found = await readSkillMd(dir);
  if (!found) {
    throw new Error(`No SKILL.md found in ${dir}`);
  }
  const skillMdPath = found.path;
  const { data, content } = parseFrontmatter(found.content);

  const name = coerceTrimmed(data.name, fallbackName ?? basename(dir));

  const description = coerceString(data.description).trim();
  const metadata = data.metadata;
  const internal =
    typeof metadata === 'object' &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).internal === true;

  const files = buildFileInfos(await walkFiles(dir));
  const sizeBytes = files.reduce((sum, file) => sum + file.size, 0);
  const mtimeMs = await mtimeOf(skillMdPath);

  const truncatedBody =
    content.length > MAX_BODY_CHARS ? `${content.slice(0, MAX_BODY_CHARS)}\n…` : content;

  return {
    name,
    description,
    frontmatter: data,
    body: truncatedBody,
    bodyTruncated: content.length > MAX_BODY_CHARS,
    internal,
    triggers: extractTriggers({
      name,
      description,
      frontmatter: data,
      body: content,
    }),
    files,
    sizeBytes,
    mtimeMs,
    skillMdPath,
  };
}

async function mtimeOf(path: string): Promise<number> {
  try {
    const { stat } = await import('node:fs/promises');
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}
