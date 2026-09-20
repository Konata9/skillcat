/**
 * Deterministic text similarity: CJK-aware tokenization (Intl.Segmenter plus
 * bigram merging), IDF-weighted trigger overlap and body shingle Jaccard.
 * Pure functions — no IO, no state.
 */
import { recordKey } from './keys.js';
import type { SkillRecord } from './types.js';

const segmenter = new Intl.Segmenter(['zh', 'en'], { granularity: 'word' });

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'when', 'use',
  'used', 'using', 'user', 'users', 'is', 'are', 'be', 'by', 'this', 'that', 'it', 'as',
  'at', 'from', 'not', 'do', 'does', 'can', 'should', 'will', 'your', 'you', 'skill',
  'skills', 'any', 'all', 'if', 'then', 'than', 'into', 'out', 'up', 'about', 'also',
  'make', 'makes', 'look', 'looks', 'new', 'work', 'works', 'ask', 'asks', 'says',
  'say', 'help', 'helps', 'including', 'include', 'includes', 'want', 'wants',
  '的', '了', '是', '在', '和', '与', '或', '及', '等', '当', '时', '用', '为', '对',
  '从', '到', '把', '被', '让', '会', '要', '有', '不', '也', '都', '就', '而', '并',
  '请', '你', '我', '他', '她', '它', '们', '一个', '这个', '那个', '可以', '需要',
  '使用', '用户', '进行', '通过', '支持', '包括', '以及', '然后', '如果', '因为',
  '所以', '但是', '以及', '用于', '用来', '任何', '所有', '当前', '这个', '一些',
  '一下', '看看', '什么', '怎么', '没有', '或者', '时候', '相关', '内容', '方式',
]);

const CJK_RE = /[\u3400-\u9fff]/;

export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase();
  const tokens: string[] = [];
  let pendingSingles: string[] = [];

  const flushSingles = () => {
    if (pendingSingles.length >= 2) {
      for (let i = 0; i + 2 <= pendingSingles.length; i += 1) {
        const bigram = pendingSingles[i]! + pendingSingles[i + 1]!;
        if (!STOPWORDS.has(bigram)) tokens.push(bigram);
      }
    }
    pendingSingles = [];
  };

  for (const segment of segmenter.segment(normalized)) {
    if (!segment.isWordLike) {
      flushSingles();
      continue;
    }
    const token = segment.segment.trim();
    if (!token) {
      flushSingles();
      continue;
    }
    // ICU often splits compound CJK words into single characters (e.g. 润色).
    // Merge only consecutive single-char segments into bigrams so we never
    // cross real word boundaries (做发布前 must not become 做发/布前).
    if (CJK_RE.test(token) && token.length === 1) {
      pendingSingles.push(token);
      continue;
    }
    flushSingles();
    if (STOPWORDS.has(token)) continue;
    if (token.length >= 2) tokens.push(token);
  }
  flushSingles();
  return tokens;
}

export interface SkillVector {
  key: string;
  name: string;
  tokenWeights: Map<string, number>;
  termNorms: Set<string>;
}

export function buildVector(record: SkillRecord): SkillVector {
  const tokenWeights = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const token of tokenize(text)) {
      const prev = tokenWeights.get(token) ?? 0;
      if (weight > prev) tokenWeights.set(token, weight);
    }
  };
  for (const term of record.triggers.positive) add(term.text, term.weight);
  for (const term of record.triggers.negative) add(term.text, term.weight * 0.8);
  for (const intent of record.triggers.intents) add(intent, 0.6);

  const termNorms = new Set<string>();
  for (const term of record.triggers.positive) termNorms.add(term.norm);
  for (const term of record.triggers.negative) termNorms.add(term.norm);

  return { key: recordKey(record), name: record.name, tokenWeights, termNorms };
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let intersection = 0;
  for (const item of small) {
    if (large.has(item)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

export interface OverlapPair {
  aKey: string;
  bKey: string;
  aName: string;
  bName: string;
  score: number;
  cosine: number;
  jaccard: number;
  shared: string[];
}

export function computeOverlaps(records: SkillRecord[], threshold: number): OverlapPair[] {
  const vectors = records.map(buildVector);
  const n = vectors.length;
  if (n < 2) return [];

  const df = new Map<string, number>();
  for (const vector of vectors) {
    for (const token of vector.tokenWeights.keys()) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  const idf = (token: string) => Math.log(1 + n / (df.get(token) ?? 1));
  const maxDf = Math.max(2, Math.ceil(n * 0.3));

  const weighted = vectors.map((vector) => {
    const map = new Map<string, number>();
    for (const [token, weight] of vector.tokenWeights) {
      map.set(token, weight * idf(token));
    }
    let norm = 0;
    let l1 = 0;
    for (const value of map.values()) {
      norm += value * value;
      l1 += value;
    }
    return { map, norm: Math.sqrt(norm), l1 };
  });

  const pairs: OverlapPair[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const vectorA = vectors[i]!;
      const vectorB = vectors[j]!;
      // Skills in the same family (pdf ↔ pdf-tools) are expected
      // to share triggers; not an issue worth reporting.
      if (vectorA.name.startsWith(vectorB.name) || vectorB.name.startsWith(vectorA.name)) {
        continue;
      }
      const a = weighted[i]!;
      const b = weighted[j]!;
      let dot = 0;
      let sharedWeight = 0;
      let specificShare = false;
      const sharedTokens: Array<{ token: string; score: number }> = [];
      const [small, large] = a.map.size <= b.map.size ? [a.map, b.map] : [b.map, a.map];
      for (const [token, value] of small) {
        const other = large.get(token);
        if (other === undefined) continue;
        dot += value * other;
        sharedWeight += value * other;
        if ((df.get(token) ?? n) <= maxDf) specificShare = true;
        sharedTokens.push({ token, score: value * other });
      }
      if (dot === 0 || !specificShare) continue;
      const cosine = dot / (a.norm * b.norm || 1);
      const overlap = sharedWeight / Math.min(a.l1, b.l1 || 1);
      const jac = jaccard(
        vectorA.termNorms.size > 0 ? vectorA.termNorms : new Set(vectorA.tokenWeights.keys()),
        vectorB.termNorms.size > 0 ? vectorB.termNorms : new Set(vectorB.tokenWeights.keys()),
      );
      const score = 0.7 * overlap + 0.3 * cosine;
      if (score < threshold) continue;
      sharedTokens.sort((x, y) => y.score - x.score);
      pairs.push({
        aKey: vectorA.key,
        bKey: vectorB.key,
        aName: vectorA.name,
        bName: vectorB.name,
        score,
        cosine,
        jaccard: jac,
        shared: sharedTokens.slice(0, 6).map((item) => item.token),
      });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  return pairs.slice(0, 500);
}

export function bodyShingles(text: string, k = 4): Set<string> {
  const tokens = tokenize(text);
  if (tokens.length === 0) return new Set();
  if (tokens.length < k) return new Set(tokens);
  const set = new Set<string>();
  for (let i = 0; i + k <= tokens.length; i += 1) {
    set.add(tokens.slice(i, i + k).join(' '));
  }
  return set;
}

export function bodySimilarity(a: string, b: string, k = 4): number {
  return jaccard(bodyShingles(a, k), bodyShingles(b, k));
}
