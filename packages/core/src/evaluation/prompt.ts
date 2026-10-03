/**
 * Versioned evaluation prompts.
 *
 * The catalog is serialized as JSON so the model sees stable, explicit fields.
 * Skills are referenced by short ids (`s1`, `s2`) rather than scope/path, which
 * the model cannot be trusted to reproduce; the caller maps ids back.
 */

import type {
  AiPairVerdict,
  EvaluationLocale,
  EvaluationSkillScore,
  Scope,
} from '../types.js';

export interface CatalogSkill {
  id: string;
  name: string;
  scope: Scope;
  projectPath?: string;
  description: string;
  whenToUse: string[];
  triggers: string[];
  excerpt: string;
  fileCount: number;
}

export interface CatalogPair {
  id: string;
  a: string;
  b: string;
  reason: string;
}

function languageName(locale: EvaluationLocale): string {
  return locale === 'zh' ? 'Simplified Chinese (简体中文)' : 'English';
}

function systemPrompt(locale: EvaluationLocale): string {
  return [
    'You are a senior reviewer of "Agent Skills" — SKILL.md instruction packs loaded by coding agents.',
    'Evaluate the provided skills against these criteria:',
    '1. Description & triggerability: is the description specific enough for an agent to know WHEN to load the skill? Are "Use when…" signals present?',
    '2. Scope & boundaries: does it state what it does NOT cover? Is it too broad or too narrow?',
    '3. Instruction quality: concrete, actionable steps; no vague filler; correct references to its supporting files.',
    '4. Duplication risk: near-duplicate purpose or content versus another provided skill.',
    '5. Conflict risk: contradictory guidance, mutually exclusive triggers, or a positive/negative trigger collision.',
    '',
    'Rules:',
    '- Only reason about the provided skills. Never invent skills, files, or facts.',
    '- Be strict but fair. Reserve scores of 90+ for genuinely excellent skills.',
    '- Grade mapping: A = 90-100, B = 75-89, C = 60-74, D = below 60.',
    '- Be concise: at most 2 sentences per summary, at most 3 strengths and 3 issues per skill, titles under 12 words.',
    '- In every prose field, refer to skills by their `name` (e.g. "pdf-tools"). Never mention catalog ids like "s1" or "s45".',
    '- Reply with a single JSON object and nothing else. No markdown, no code fences, no commentary.',
    '- Always close every array and object so the JSON is complete.',
    `- Write every prose field (summary, strengths, issues, title, detail, suggestion) in ${languageName(locale)}.`,
  ].join('\n');
}

export function buildScoringPrompt(input: {
  locale: EvaluationLocale;
  skills: CatalogSkill[];
}): { system: string; prompt: string } {
  const schema = [
    'Return exactly this JSON shape:',
    '{"scores":[{"id":"s1","score":0,"grade":"A","summary":"","strengths":[""],"issues":[""]}]}',
    'Include every provided skill id exactly once. "score" is an integer 0-100. "strengths" and "issues" may be empty arrays.',
  ].join('\n');
  const prompt = [
    'Score each of the following skills.',
    '',
    'Skills:',
    JSON.stringify(input.skills),
    '',
    schema,
  ].join('\n');
  return { system: systemPrompt(input.locale), prompt };
}

export function buildSummaryPrompt(input: {
  locale: EvaluationLocale;
  scores: EvaluationSkillScore[];
  verdicts: AiPairVerdict[];
}): { system: string; prompt: string } {
  const schema = [
    'Return exactly this JSON shape:',
    '{"summary":""}',
    'The summary is 2-4 sentences: overall quality, the most important problems, and one concrete next step.',
  ].join('\n');
  const scores = input.scores.map((item) => ({
    name: item.skill.name,
    score: item.score,
    grade: item.grade,
    issues: item.issues,
  }));
  const issues = input.verdicts
    .filter((item) => item.verdict === 'confirmed')
    .map((item) => ({ title: item.title, severity: item.severity }));
  const prompt = [
    'Write an overall summary of this skill evaluation.',
    '',
    'Scores:',
    JSON.stringify(scores),
    '',
    'Confirmed issues:',
    JSON.stringify(issues),
    '',
    schema,
  ].join('\n');
  return { system: systemPrompt(input.locale), prompt };
}

export function buildVerdictPrompt(input: {
  locale: EvaluationLocale;
  pairs: CatalogPair[];
  skills: CatalogSkill[];
}): { system: string; prompt: string } {
  const schema = [
    'Return exactly this JSON shape:',
    '{"verdicts":[{"a":"s1","b":"s2","kind":"duplicate","verdict":"confirmed","severity":"warn","title":"","detail":"","suggestion":""}]}',
    '"kind" is one of "duplicate" | "conflict" | "trigger" | "boundary" | "quality".',
    '"verdict" is one of "confirmed" (a real issue), "false-positive" (the candidate is not a real issue) or "uncertain".',
    '"severity" is one of "error" | "warn" | "info".',
    'Return exactly one verdict for EVERY candidate pair, keyed by its ids. Never add or omit pairs.',
    'For "false-positive", keep title/detail short and leave suggestion empty.',
  ].join('\n');
  const prompt = [
    'Judge the following candidate skill pairs for duplication, conflicts and trigger/boundary problems.',
    'Each pair is a pre-filtered candidate; decide whether it is a real issue, a false positive, or unclear.',
    '',
    'Skills:',
    JSON.stringify(input.skills),
    '',
    'Candidate pairs:',
    JSON.stringify(input.pairs),
    '',
    schema,
  ].join('\n');
  return { system: systemPrompt(input.locale), prompt };
}

/**
 * Builds the read-only optimization prompt for a single skill. The built-in
 * `skill-optimizer` body, when present, is injected as the review rubric so the
 * model follows the app's own methodology (a same-named user skill is never
 * used for this).
 */
export function buildOptimizePrompt(input: {
  locale: EvaluationLocale;
  skill: CatalogSkill;
  rubric?: string;
}): { system: string; prompt: string } {
  const rubric = input.rubric?.trim();
  const system = [
    systemPrompt(input.locale),
    '',
    'Your current task is to review ONE skill and propose read-only improvements.',
    'Only reason about the provided skill. Never invent files, facts or neighbouring skills.',
    'Prefer removing redundant rules and widening/narrowing triggers over adding boilerplate; "keep as is" is a valid conclusion.',
    ...(rubric
      ? ['', 'Apply this built-in review methodology as your rubric:', rubric]
      : []),
    '',
    'Return exactly this JSON shape:',
    '{"summary":"","suggestions":[{"title":"","severity":"high","rationale":"","before":"","after":""}]}',
    '- "summary": 1-3 sentences on the skill\'s overall quality and the highest-impact fix.',
    '- "severity": one of "high" | "medium" | "low".',
    '- "before"/"after": optional short excerpts; leave empty when not applicable.',
    '- At most 8 suggestions. Return an empty array when the skill is already good.',
    '- Reply with a single JSON object and nothing else. No markdown, no code fences.',
    `- Write every prose field in ${languageName(input.locale)}.`,
  ].join('\n');

  const prompt = [
    'Review and optimize this skill.',
    '',
    'Skill:',
    JSON.stringify(input.skill),
  ].join('\n');
  return { system, prompt };
}
