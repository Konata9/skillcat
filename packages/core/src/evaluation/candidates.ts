/**
 * Builds the model-facing catalog and the deterministic candidate pairs.
 *
 * The candidate filter reuses the same similarity helpers as the rule engine,
 * so the AI reviews the same leads the local rules surface. Batching keeps a
 * scoring prompt within a sane size regardless of catalog size.
 */
import { toStringList } from '../coerce.js';
import { recordKey, unorderedPairKey } from '../keys.js';
import { bodyShingles, computeOverlaps, jaccard } from '../similarity.js';
import type { SkillRecord } from '../types.js';
import type { CatalogPair, CatalogSkill } from './prompt.js';

const EXCERPT_CHARS = 1200;
const MAX_BATCH_CHARS = 12_000;
const MAX_BATCH_SKILLS = 6;
const MAX_PAIRS = 24;
const PAIR_TRIGGER_THRESHOLD = 0.2;
const PAIR_BODY_THRESHOLD = 0.15;

function excerpt(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS)}…` : text;
}

function coerceList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return toStringList(value);
}

export function buildCatalogEntries(records: SkillRecord[]): CatalogSkill[] {
  return records.map((record, index) => ({
    id: `s${index + 1}`,
    name: record.name,
    scope: record.scope,
    ...(record.projectPath ? { projectPath: record.projectPath } : {}),
    description: record.description,
    whenToUse: coerceList(record.frontmatter.when_to_use).slice(0, 8),
    triggers: record.triggers.positive.slice(0, 12).map((term) => term.text),
    excerpt: excerpt(record.body),
    fileCount: record.files.length,
  }));
}

/** Candidate pairs from trigger overlap + body similarity, capped. */
export function buildPairs(records: SkillRecord[], catalog: CatalogSkill[]): CatalogPair[] {
  const idByKey = new Map(records.map((record, index) => [recordKey(record), catalog[index]!.id]));
  const pairs = new Map<string, CatalogPair>();
  const add = (aKey: string, bKey: string, reason: string) => {
    const a = idByKey.get(aKey);
    const b = idByKey.get(bKey);
    if (!a || !b || a === b) return;
    const key = unorderedPairKey(a, b);
    if (pairs.has(key)) return;
    pairs.set(key, { id: `p${pairs.size + 1}`, a, b, reason });
  };

  for (const pair of computeOverlaps(records, PAIR_TRIGGER_THRESHOLD)) {
    add(pair.aKey, pair.bKey, `trigger overlap ${Math.round(pair.score * 100)}%`);
  }

  const shingles = new Map<string, Set<string>>();
  for (let i = 0; i < records.length; i += 1) {
    const a = records[i]!;
    if (a.body.length < 200) continue;
    const aKey = recordKey(a);
    for (let j = i + 1; j < records.length; j += 1) {
      const b = records[j]!;
      if (b.body.length < 200 || a.name === b.name) continue;
      const bKey = recordKey(b);
      const aShingles = shingles.get(aKey) ?? bodyShingles(a.body);
      const bShingles = shingles.get(bKey) ?? bodyShingles(b.body);
      shingles.set(aKey, aShingles);
      shingles.set(bKey, bShingles);
      const score = jaccard(aShingles, bShingles);
      if (score >= PAIR_BODY_THRESHOLD) {
        add(aKey, bKey, `body similarity ${Math.round(score * 100)}%`);
      }
    }
  }

  return [...pairs.values()].slice(0, MAX_PAIRS);
}

/** Splits the catalog into scoring batches bounded by count and serialized size. */
export function chunkSkills(skills: CatalogSkill[]): CatalogSkill[][] {
  const batches: CatalogSkill[][] = [];
  let current: CatalogSkill[] = [];
  let chars = 0;
  for (const skill of skills) {
    const size = JSON.stringify(skill).length;
    if (current.length > 0 && (current.length >= MAX_BATCH_SKILLS || chars + size > MAX_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(skill);
    chars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
