/**
 * Pure helpers that turn raw spool records into matched, persisted events.
 *
 * Matching is intentionally adapter-agnostic: adapters emit a skill name (and
 * optionally a path / cwd), and these helpers resolve it against the scanned
 * catalog. Events that match no scanned skill are dropped, so the activity log
 * only ever references skills SkillCat knows about.
 */
import { sep } from 'node:path';
import { recordKey } from '../keys.js';
import { normalizeTerm } from '../triggers.js';
import type {
  BridgeAdapter,
  ParsedRuntimeEvent,
  RuntimeSkillEvent,
  Scope,
  SkillRecord,
} from '../types.js';

export interface SkillCatalogEntry {
  key: string;
  name: string;
  scope: Scope;
  projectPath?: string;
  path: string;
  positive: Array<{ text: string; norm: string }>;
}

export interface CatalogIndex {
  byPath: Map<string, SkillCatalogEntry>;
  byName: Map<string, SkillCatalogEntry[]>;
}

export function buildCatalogIndex(records: SkillRecord[]): CatalogIndex {
  const byPath = new Map<string, SkillCatalogEntry>();
  const byName = new Map<string, SkillCatalogEntry[]>();
  for (const record of records) {
    const entry: SkillCatalogEntry = {
      key: recordKey(record),
      name: record.name,
      scope: record.scope,
      projectPath: record.projectPath,
      path: record.path,
      positive: record.triggers.positive
        .filter((term) => term.kind === 'positive' && Boolean(term.norm))
        .map((term) => ({ text: term.text, norm: term.norm })),
    };
    byPath.set(record.path, entry);
    const list = byName.get(record.name);
    if (list) list.push(entry);
    else byName.set(record.name, [entry]);
  }
  return { byPath, byName };
}

function isWithin(cwd: string, root: string): boolean {
  return cwd === root || cwd.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

/** Resolves a parsed event to a scanned skill, or null when unmatched. */
export function matchCatalog(
  parsed: ParsedRuntimeEvent,
  index: CatalogIndex,
): SkillCatalogEntry | null {
  if (parsed.path) {
    const direct = index.byPath.get(parsed.path);
    if (direct) return direct;
  }
  const candidates = index.byName.get(parsed.skillName);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (parsed.cwd) {
    const projectHit = candidates.find(
      (entry) =>
        entry.scope === 'project' &&
        entry.projectPath !== undefined &&
        isWithin(parsed.cwd as string, entry.projectPath),
    );
    if (projectHit) return projectHit;
  }
  return candidates.find((entry) => entry.scope === 'global') ?? candidates[0];
}

/** Longest positive trigger term contained in the phrase, if any. */
export function matchTriggerTerm(
  phrase: string | null,
  entry: SkillCatalogEntry | null,
): string | null {
  if (!phrase || !entry) return null;
  const haystack = normalizeTerm(phrase);
  let best: { text: string; length: number } | null = null;
  for (const term of entry.positive) {
    if (!haystack.includes(term.norm)) continue;
    if (!best || term.norm.length > best.length) {
      best = { text: term.text, length: term.norm.length };
    }
  }
  return best?.text ?? null;
}

function truncate(value: string | null, max: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

let sequence = 0;

function nextId(): string {
  sequence = (sequence + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Builds a persisted event from a parsed one, or null when unmatched. */
export function localizeEvent(
  parsed: ParsedRuntimeEvent,
  adapter: BridgeAdapter,
  index: CatalogIndex,
  options: { storePhrase: boolean; maxPhraseChars: number },
): RuntimeSkillEvent | null {
  const entry = matchCatalog(parsed, index);
  if (!entry) return null;
  return {
    id: nextId(),
    adapterId: adapter.id,
    agentDisplay: adapter.display,
    skillName: entry.name,
    skillKey: entry.key,
    scope: entry.scope,
    projectPath: entry.projectPath,
    task: parsed.task,
    taskId: parsed.taskId,
    source: parsed.source,
    phrase: options.storePhrase ? truncate(parsed.phrase, options.maxPhraseChars) : null,
    triggerTerm: matchTriggerTerm(parsed.phrase, entry),
    sessionId: parsed.sessionId,
    cwd: parsed.cwd,
    at: parsed.at,
  };
}

/** Splits spool content into JSON records, skipping corrupt lines. */
export function parseSpoolContent(raw: string): unknown[] {
  const records: unknown[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // A partially written line is skipped, never fatal.
    }
  }
  return records;
}
