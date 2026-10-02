/**
 * Heuristic similarity rules: trigger overlap, negative/positive trigger
 * contradictions, and near-duplicate bodies. All carry a confidence and
 * evidence so the UI can explain why they fired.
 */
import { recordKey, unorderedPairKey } from '../keys.js';
import { bodyShingles, computeOverlaps, jaccard } from '../similarity.js';
import type { Finding } from '../types.js';
import { message, ref, type AnalysisRule } from './helpers.js';

const MAX_NEGATIVE_HITS = 100;
const MAX_DUPLICATES = 200;
const MIN_BODY_LENGTH = 200;
const TOKEN_PREFILTER = 0.2;

/** Two skills share a significant set of trigger terms. */
export const triggerOverlapRule: AnalysisRule = ({ records, thresholds }) => {
  const findings: Finding[] = [];
  const byKey = new Map(records.map((record) => [recordKey(record), record]));
  const seenPairs = new Set<string>();
  for (const pair of computeOverlaps(records, thresholds.overlap)) {
    const a = byKey.get(pair.aKey);
    const b = byKey.get(pair.bKey);
    if (!a || !b) continue;
    // Same name across scopes is covered by shadowing/source-conflict rules.
    if (a.name === b.name) continue;
    // Collapse the same semantic pair repeated across scopes.
    const dedupeKey = unorderedPairKey(a.name, b.name);
    if (seenPairs.has(dedupeKey)) continue;
    seenPairs.add(dedupeKey);
    const shared = pair.shared;
    findings.push({
      id: `trigger-overlap:${pair.aKey}:${pair.bKey}`,
      rule: 'trigger-overlap',
      severity: 'info',
      confidence: 'heuristic',
      title: message('finding.triggerOverlap.title', { a: a.name, b: b.name }),
      detail:
        shared.length > 0
          ? message('finding.triggerOverlap.detail', {
              score: Math.round(pair.score * 100),
              cosine: Math.round(pair.cosine * 100),
              jaccard: Math.round(pair.jaccard * 100),
              shared,
            })
          : message('finding.triggerOverlap.detailNoShared', {
              score: Math.round(pair.score * 100),
              cosine: Math.round(pair.cosine * 100),
              jaccard: Math.round(pair.jaccard * 100),
            }),
      suggestion: message('finding.triggerOverlap.suggestion'),
      skills: [ref(a), ref(b)],
      evidence: shared,
      score: pair.score,
    });
  }
  return findings;
};

/** One skill's negative trigger term is another skill's positive trigger term. */
export const negativeContradictionRule: AnalysisRule = ({ records }) => {
  const findings: Finding[] = [];
  outer: for (const a of records) {
    for (const b of records) {
      if (a === b) continue;
      const positives = new Set(b.triggers.positive.map((term) => term.norm));
      for (const negative of a.triggers.negative) {
        if (!positives.has(negative.norm)) continue;
        findings.push({
          id: `negative-contradiction:${recordKey(a)}:${recordKey(b)}:${negative.norm}`,
          rule: 'negative-contradiction',
          severity: 'info',
          confidence: 'heuristic',
          title: message('finding.negativeContradiction.title', { a: a.name, b: b.name }),
          detail: message('finding.negativeContradiction.detail', {
            term: negative.text,
            a: a.name,
            b: b.name,
          }),
          suggestion: message('finding.negativeContradiction.suggestion'),
          skills: [ref(a), ref(b)],
          evidence: [negative.text],
        });
        if (findings.length >= MAX_NEGATIVE_HITS) break outer;
      }
    }
  }
  return findings;
};

/** Two skills have near-identical bodies (shingle Jaccard above threshold). */
export const duplicateContentRule: AnalysisRule = ({ records, thresholds }) => {
  const findings: Finding[] = [];
  const shingleCache = new Map<string, Set<string>>();
  const tokenCache = new Map<string, Set<string>>();
  const seenPairs = new Set<string>();
  for (let i = 0; i < records.length; i += 1) {
    const a = records[i]!;
    if (a.body.length < MIN_BODY_LENGTH) continue;
    const aKey = recordKey(a);
    const aTokens = tokenCache.get(aKey) ?? bodyShingles(a.body, 1);
    tokenCache.set(aKey, aTokens);
    for (let j = i + 1; j < records.length; j += 1) {
      const b = records[j]!;
      if (b.body.length < MIN_BODY_LENGTH) continue;
      if (a.name === b.name) continue;
      const dedupeKey = unorderedPairKey(a.name, b.name);
      if (seenPairs.has(dedupeKey)) continue;
      const bKey = recordKey(b);
      const bTokens = tokenCache.get(bKey) ?? bodyShingles(b.body, 1);
      tokenCache.set(bKey, bTokens);
      if (jaccard(aTokens, bTokens) < TOKEN_PREFILTER) continue;
      const aShingles = shingleCache.get(aKey) ?? bodyShingles(a.body);
      shingleCache.set(aKey, aShingles);
      const bShingles = shingleCache.get(bKey) ?? bodyShingles(b.body);
      shingleCache.set(bKey, bShingles);
      const score = jaccard(aShingles, bShingles);
      if (score < thresholds.duplicate) continue;
      seenPairs.add(dedupeKey);
      findings.push({
        id: `duplicate-content:${aKey}:${bKey}`,
        rule: 'duplicate-content',
        severity: 'warn',
        confidence: 'heuristic',
        title: message('finding.duplicateContent.title', { a: a.name, b: b.name }),
        detail: message('finding.duplicateContent.detail', { score: Math.round(score * 100) }),
        suggestion: message('finding.duplicateContent.suggestion'),
        skills: [ref(a), ref(b)],
        evidence: [],
        score,
      });
      if (findings.length >= MAX_DUPLICATES) break;
    }
  }
  return findings;
};
