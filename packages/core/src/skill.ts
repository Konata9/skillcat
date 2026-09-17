/**
 * SKILL.md parsing: frontmatter extraction (YAML), description/name coercion,
 * file inventory and trigger-profile extraction for a single skill directory.
 */
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { readFileSafe, walkFiles, type WalkedFile } from './fs-utils.js';
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function coerceString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join('\n');
  }
  if (value === null || value === undefined) return '';
  return String(value);
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

export async function findSkillMd(dir: string): Promise<string | null> {
  for (const candidate of ['SKILL.md', 'skill.md', 'Skill.md']) {
    const path = join(dir, candidate);
    const content = await readFileSafe(path);
    if (content !== null) return path;
  }
  return null;
}

export async function parseSkillDir(dir: string, fallbackName?: string): Promise<ParsedSkill> {
  const skillMdPath = await findSkillMd(dir);
  if (!skillMdPath) {
    throw new Error(`No SKILL.md found in ${dir}`);
  }
  const raw = (await readFileSafe(skillMdPath)) ?? '';
  const { data, content } = parseFrontmatter(raw);

  const rawName = data.name;
  const name =
    typeof rawName === 'string' && rawName.trim()
      ? rawName.trim()
      : (fallbackName ?? basename(dir));

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
