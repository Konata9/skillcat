/**
 * Derives chart- and table-ready aggregates from the activity log. Pure: the
 * same events always yield the same numbers, and no display strings beyond the
 * data's own labels (skill name, agent display, task text) are produced.
 */
import { normalizeTerm } from '../triggers.js';
import type {
  ActivityCount,
  ActivityPhraseConflict,
  ActivitySkillStat,
  ActivityStats,
  RuntimeSkillEvent,
} from '../types.js';

interface Bucket {
  key: string;
  label: string;
  count: number;
}

function bump(map: Map<string, Bucket>, key: string, label: string): void {
  const existing = map.get(key);
  if (existing) existing.count += 1;
  else map.set(key, { key, label, count: 1 });
}

function finish(map: Map<string, Bucket>): ActivityCount[] {
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function computeActivityStats(
  events: RuntimeSkillEvent[],
  extra: { unmatched?: number } = {},
): ActivityStats {
  const bySkill = new Map<string, ActivitySkillStat>();
  const byAgent = new Map<string, Bucket>();
  const byDay = new Map<string, number>();
  const phraseGroups = new Map<string, { phrase: string; skills: Set<string>; count: number }>();

  for (const event of events) {
    const existing = bySkill.get(event.skillKey);
    if (existing) {
      existing.count += 1;
      if (event.at >= existing.lastAt) {
        existing.lastAt = event.at;
        existing.lastPhrase = event.phrase;
      }
    } else {
      bySkill.set(event.skillKey, {
        key: event.skillKey,
        label: event.skillName,
        count: 1,
        lastAt: event.at,
        lastPhrase: event.phrase,
      });
    }

    bump(byAgent, event.adapterId, event.agentDisplay);
    byDay.set(event.at.slice(0, 10), (byDay.get(event.at.slice(0, 10)) ?? 0) + 1);

    if (event.phrase) {
      const norm = normalizeTerm(event.phrase);
      if (norm) {
        const group = phraseGroups.get(norm);
        if (group) {
          group.skills.add(event.skillKey);
          group.count += 1;
        } else {
          phraseGroups.set(norm, {
            phrase: event.phrase,
            skills: new Set([event.skillKey]),
            count: 1,
          });
        }
      }
    }
  }

  const skills = [...bySkill.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );

  const phrases = [...phraseGroups.values()]
    .filter((group) => group.skills.size > 1)
    .map<ActivityPhraseConflict>((group) => ({
      phrase: group.phrase,
      skills: [...group.skills],
      count: group.count,
    }))
    .sort((a, b) => b.count - a.count);

  const days = [...byDay.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const unmatched = extra.unmatched ?? 0;

  return {
    total: events.length,
    uniqueSkills: bySkill.size,
    activeAgents: byAgent.size,
    unmatched,
    bySkill: skills,
    byAgent: finish(byAgent),
    byDay: days,
    phraseConflicts: phrases,
  };
}
