/**
 * Trigger-profile extraction from skill metadata and prose: frontmatter
 * (`when_to_use`, `dispatch_intent`), description patterns and "When to Use"
 * body sections, plus applying/merging user annotations. Pure text analysis.
 */
import type { Annotation, TriggerProfile, TriggerSource, TriggerTerm } from './types.js';

const WEIGHTS: Record<Exclude<TriggerSource, 'user'>, number> = {
  when_to_use: 1,
  dispatch_intent: 0.8,
  description: 0.7,
  body: 0.5,
  name: 0.3,
};

const MAX_TERM_LENGTH = 50;

const GENERIC_NORMS = new Set([
  'etc', 'and', 'or', 'e.g', 'eg', 'i.e', 'ie', '...', '…', '提到', '或提到', 'trigger',
]);

const LEAD_NOISE = [
  '当用户',
  '用户要求',
  '用户需要',
  '用户说',
  '用户',
  '要求',
  '需要',
  '提到',
  'when the user',
  'when users',
  'when a user',
  'when user',
];

export function normalizeTerm(text: string): string {
  let value = text.normalize('NFKC').trim();
  value = value.replace(/^[\s"'`「『（(\[【<]+/, '');
  value = value.replace(/[\s"'`」』）)\]】>。，,;；:：!！?？.]+$/, '');
  value = value.replace(/\s+/g, ' ').trim();
  return value.toLowerCase();
}

function stripLeadNoise(text: string): string {
  let value = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const noise of LEAD_NOISE) {
      if (value.toLowerCase().startsWith(noise)) {
        value = value.slice(noise.length).trim();
        value = value.replace(/^[的、，,：:]\s*/, '');
        changed = true;
      }
    }
  }
  return value;
}

export function splitList(text: string): string[] {
  const parts = text
    .split(/[,，、;；|]|[""「」『』"]/)
    .flatMap((part) => part.split(/\s+或\s+|\s+or\s+/i))
    .map((part) => stripLeadNoise(part))
    .filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const norm = normalizeTerm(part);
    if (!norm || norm.length > MAX_TERM_LENGTH) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    result.push(part.trim());
  }
  return result;
}

function makeTerm(text: string, kind: 'positive' | 'negative', source: TriggerSource): TriggerTerm | null {
  let clean = stripLeadNoise(text).replace(/\s+/g, ' ').trim();
  clean = clean.replace(/\s*\([^()]*\)\s*$/g, '').trim();
  clean = clean.replace(/[.,;:]+$/, '').trim();
  const norm = normalizeTerm(clean);
  if (!norm) return null;
  if (norm.length > MAX_TERM_LENGTH) return null;
  if (GENERIC_NORMS.has(norm)) return null;
  return {
    text: clean,
    norm,
    kind,
    source,
    weight: source === 'user' ? 1.2 : WEIGHTS[source],
  };
}

function pushTerms(
  target: TriggerTerm[],
  text: string,
  kind: 'positive' | 'negative',
  source: TriggerSource,
): void {
  for (const part of splitList(text)) {
    const term = makeTerm(part, kind, source);
    if (term) target.push(term);
  }
}

const QUOTE_PATTERNS: RegExp[] = [
  /[""]([^""\n]{1,40})[""]/g,
  /"([^"\n]{1,40})"/g,
  /「([^」\n]{1,40})」/g,
  /『([^』\n]{1,40})』/g,
];

const CJK_RE = /[\u3400-\u9fff]/;

function extractQuoted(text: string, kind: 'positive' | 'negative', source: TriggerSource): TriggerTerm[] {
  const out: TriggerTerm[] = [];
  for (const pattern of QUOTE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const term = makeTerm(match[1] ?? '', kind, source);
      if (term) out.push(term);
    }
  }
  // Straight single quotes are only safe when CJK text is involved.
  if (CJK_RE.test(text)) {
    const pattern = /'([^'\n]{1,40})'/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const term = makeTerm(match[1] ?? '', kind, source);
      if (term) out.push(term);
    }
  }
  return out;
}

function readStringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

const DESCRIPTION_PATTERNS: Array<{
  pattern: RegExp;
  kind: 'positive' | 'negative';
}> = [
  { pattern: /use when\s+([^.]{2,200})/gi, kind: 'positive' },
  { pattern: /trigger(?:ed|s)? (?:on|when|by)[:\s]+([^.]{2,200})/gi, kind: 'positive' },
  { pattern: /not (?:for|when)\s+([^.]{2,200})/gi, kind: 'negative' },
  { pattern: /当([^。]{2,120}?)时(?:触发|使用|调用|采用)/g, kind: 'positive' },
  { pattern: /或提到([^。时]{1,120}?)(?:时|。|$)/g, kind: 'positive' },
  { pattern: /触发词[:：]\s*([^\n。]{1,200})/g, kind: 'positive' },
  { pattern: /适用于([^。]{1,120})/g, kind: 'positive' },
  { pattern: /不(?:适用|用于|适合)(?:于)?([^。]{1,120})/g, kind: 'negative' },
];

const TRIGGER_HEADING_RE = /^(when to use|when to use this skill|triggers?|trigger conditions?|触发条件|触发词|触发|何时使用|适用场景|使用场景|何时触发)/i;

function extractBodyTerms(body: string): TriggerTerm[] {
  const terms: TriggerTerm[] = [];
  const lines = body.split(/\r?\n/);
  let activeLevel = 0;
  let inSection = false;
  const sectionLines: string[] = [];

  const flush = () => {
    if (sectionLines.length === 0) return;
    const block = sectionLines.join('\n');
    terms.push(...extractQuoted(block, 'positive', 'body'));
    for (const line of sectionLines) {
      const item = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim();
      if (!item || item.startsWith('#')) continue;
      const withoutQuotes = item.replace(/[""「」『』]/g, '');
      pushTerms(terms, withoutQuotes, 'positive', 'body');
    }
    sectionLines.length = 0;
  };

  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      const text = (heading[2] ?? '').trim();
      if (inSection && level <= activeLevel) {
        flush();
        inSection = false;
      }
      if (TRIGGER_HEADING_RE.test(text)) {
        inSection = true;
        activeLevel = level;
      }
      continue;
    }
    if (inSection) sectionLines.push(line);
  }
  flush();
  return terms;
}

function dedupeTerms(terms: TriggerTerm[]): TriggerTerm[] {
  const map = new Map<string, TriggerTerm>();
  for (const term of terms) {
    const key = `${term.kind}:${term.norm}`;
    const prev = map.get(key);
    if (!prev || term.weight > prev.weight) map.set(key, term);
  }
  return [...map.values()].sort(
    (a, b) => b.weight - a.weight || a.text.localeCompare(b.text),
  );
}

export interface TriggerInput {
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export function extractTriggers(input: TriggerInput): TriggerProfile {
  const positive: TriggerTerm[] = [];
  const negative: TriggerTerm[] = [];
  const intents: string[] = [];

  const whenToUse = readStringList(input.frontmatter.when_to_use);
  for (const chunk of whenToUse) pushTerms(positive, chunk, 'positive', 'when_to_use');

  const dispatchIntent = readStringList(input.frontmatter.dispatch_intent);
  for (const chunk of dispatchIntent) {
    intents.push(...splitList(chunk));
  }

  const description = input.description ?? '';
  for (const { pattern, kind } of DESCRIPTION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(description)) !== null) {
      const captured = match[1] ?? '';
      const target = kind === 'positive' ? positive : negative;
      target.push(...extractQuoted(captured, kind, 'description'));
      pushTerms(target, captured, kind, 'description');
    }
  }
  positive.push(...extractQuoted(description, 'positive', 'description'));

  positive.push(...extractBodyTerms(input.body));

  for (const token of input.name.split(/[-_]/)) {
    const term = makeTerm(token, 'positive', 'name');
    if (term && term.norm.length >= 2) positive.push(term);
  }

  const profile: TriggerProfile = {
    positive: dedupeTerms(positive),
    negative: dedupeTerms(negative),
    intents: [...new Set(intents)],
    hasWhenSignal: false,
  };
  profile.hasWhenSignal = profile.positive.some(
    (term) => term.source === 'when_to_use' || term.source === 'description' || term.source === 'body',
  );
  return profile;
}

export function applyAnnotation(
  profile: TriggerProfile,
  annotation: Annotation | undefined,
): TriggerProfile {
  if (!annotation) return profile;
  const removed = new Set(annotation.removed.map((item) => normalizeTerm(item)));
  const keep = (term: TriggerTerm) => !removed.has(term.norm);
  const added: TriggerTerm[] = [];
  for (const item of annotation.added) {
    const term = makeTerm(item.text, item.kind, 'user');
    if (term) {
      term.user = true;
      added.push(term);
    }
  }
  const positive = dedupeTerms([
    ...profile.positive.filter(keep).filter((t) => !added.some((a) => a.kind === 'positive' && a.norm === t.norm)),
    ...added.filter((t) => t.kind === 'positive'),
  ]);
  const negative = dedupeTerms([
    ...profile.negative.filter(keep).filter((t) => !added.some((a) => a.kind === 'negative' && a.norm === t.norm)),
    ...added.filter((t) => t.kind === 'negative'),
  ]);
  return { ...profile, positive, negative };
}
