// deslop-ignore-file 34: 规则名与证据条目是技术标识与数据值
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AiVerdict,
  Confidence,
  EvaluationEvent,
  EvaluationProgress,
  EvaluationReport,
  Finding,
} from '@skillcat/core';
import { recordKey } from '@skillcat/core/keys';
import { LoaderCircle } from 'lucide-react';
import { useI18n } from '@renderer/lib/i18n';
import type { MessageKey } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import { EvaluationProcess } from '../components/EvaluationProcess';
import { EmptyState, SeverityDot } from '../components/indicators';
import { Badge } from '../components/ui/badge';

type SeverityFilter = 'all' | 'error' | 'warn' | 'info';

const OVERVIEW_ID = '__overview__';

const SEVERITY_TONE = {
  error: 'error',
  warn: 'warn',
  info: 'accent',
} as const;

const CONFIDENCE_KEY: Record<Confidence, MessageKey> = {
  deterministic: 'analysis.deterministic',
  heuristic: 'analysis.heuristic',
  ai: 'analysis.confidence.ai',
};

const VERDICT_KEY: Record<AiVerdict, MessageKey> = {
  confirmed: 'analysis.aiVerdict.confirmed',
  'false-positive': 'analysis.aiVerdict.false-positive',
  uncertain: 'analysis.aiVerdict.uncertain',
};

const VERDICT_TONE = {
  confirmed: 'success',
  'false-positive': 'warn',
  uncertain: 'default',
} as const;

const VERDICT_CLASS = {
  confirmed: 'text-success',
  'false-positive': 'text-warning',
  uncertain: 'text-muted-foreground',
} as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mt-5">
      <h2 className="section-label mb-2">{title}</h2>
      {children}
    </section>
  );
}

export function AnalysisView({
  findings,
  evaluation,
  evaluationStale,
  verdictsAt,
  verdictsStale,
  evaluating,
  reviewing,
  evaluationProgress,
  evaluationError,
  processEvents,
}: {
  findings: Finding[];
  evaluation: EvaluationReport | null;
  evaluationStale: boolean;
  verdictsAt: string | null;
  verdictsStale: boolean;
  evaluating: boolean;
  reviewing: boolean;
  evaluationProgress: EvaluationProgress | null;
  evaluationError: string | null;
  processEvents: EvaluationEvent[];
}): React.ReactElement {
  const { t, formatMessage, scopeLabel, locale, relativeTime } = useI18n();
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [hideFalsePositives, setHideFalsePositives] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const severityLabel: Record<string, string> = {
    error: t('analysis.severity.error'),
    warn: t('analysis.severity.warn'),
    info: t('analysis.severity.info'),
  };

  const visible = useMemo(() => {
    const bySeverity =
      filter === 'all' ? findings : findings.filter((finding) => finding.severity === filter);
    if (!hideFalsePositives) return bySeverity;
    return bySeverity.filter((finding) => finding.ai?.verdict !== 'false-positive');
  }, [findings, filter, hideFalsePositives]);

  const falsePositiveCount = findings.filter(
    (finding) => finding.ai?.verdict === 'false-positive',
  ).length;

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(evaluation ? OVERVIEW_ID : null);
      return;
    }
    if (selectedId === OVERVIEW_ID && evaluation) return;
    if (selectedId === null) {
      setSelectedId(evaluation ? OVERVIEW_ID : visible[0]!.id);
      return;
    }
    if (!visible.some((finding) => finding.id === selectedId)) {
      setSelectedId(visible[0]!.id);
    }
  }, [visible, selectedId, evaluation]);

  const selected = visible.find((finding) => finding.id === selectedId) ?? null;
  const localeMismatch = evaluation !== null && evaluation.locale !== locale;
  const showStale = evaluationStale || verdictsStale || localeMismatch;
  const running = evaluating || reviewing;

  return (
    <div className="grid min-h-0 flex-1 grid-rows-1 grid-cols-[minmax(320px,42%)_1fr]">
      <section className="flex min-h-0 flex-col border-r border-border">
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3.5 py-2">
          {(['all', 'error', 'warn', 'info'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                'focus-ring rounded border border-transparent px-2.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground',
                filter === value && 'border-input bg-secondary text-foreground',
              )}
            >
              {value === 'all' ? t('analysis.all', { count: findings.length }) : severityLabel[value]}
            </button>
          ))}
          <div className="flex-1" />
          {falsePositiveCount > 0 ? (
            <button
              type="button"
              onClick={() => setHideFalsePositives((current) => !current)}
              aria-pressed={hideFalsePositives}
              className={cn(
                'focus-ring rounded border border-transparent px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground',
                hideFalsePositives && 'border-input bg-secondary text-foreground',
              )}
            >
              {t('analysis.hideFalsePositives')}
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {showStale ? (
            <div className="m-1.5 rounded-md border border-warning/40 px-2.5 py-1.5 text-[11px] text-warning">
              {evaluationStale ? t('analysis.aiStale') : null}
              {evaluationStale && (verdictsStale || localeMismatch) ? ' ' : null}
              {verdictsStale ? t('analysis.verdictsStale') : null}
              {verdictsStale && localeMismatch ? ' ' : null}
              {localeMismatch ? t('analysis.aiLocaleMismatch') : null}
            </div>
          ) : null}

          {running ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              <span>
                {reviewing
                  ? t('app.reviewing')
                  : evaluationProgress && evaluationProgress.total > 0
                    ? t('app.evaluateRunning', {
                        done: evaluationProgress.done,
                        total: evaluationProgress.total,
                      })
                    : t('analysis.aiEvaluating')}
              </span>
            </div>
          ) : !evaluation && visible.length === 0 ? (
            <EmptyState className="flex flex-col items-center gap-2">
              <span className="max-w-[44ch]">{t('analysis.aiEmpty')}</span>
              {evaluationError ? <span className="text-destructive">{evaluationError}</span> : null}
            </EmptyState>
          ) : (
            <div className="p-1.5">
              {evaluation ? (
                <button
                  type="button"
                  onClick={() => setSelectedId(OVERVIEW_ID)}
                  className={cn(
                    'focus-ring block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/60',
                    selectedId === OVERVIEW_ID && 'bg-primary/10',
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <span>{t('analysis.aiOverview')}</span>
                    <Badge tone="accent">
                      {t('analysis.aiAverage')} {evaluation.averageScore}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                    <span>
                      {t('analysis.aiGeneratedAt', {
                        time: relativeTime(evaluation.generatedAt),
                        model: evaluation.model,
                      })}
                    </span>
                    {verdictsAt ? (
                      <span>{t('analysis.verdictsAt', { time: relativeTime(verdictsAt) })}</span>
                    ) : null}
                  </div>
                </button>
              ) : null}

              {visible.length === 0 ? (
                <div className="px-2.5 py-2 text-[11px] text-muted-foreground">
                  {t('analysis.emptyLevel')}
                </div>
              ) : (
                visible.map((finding) => (
                  <button
                    key={finding.id}
                    type="button"
                    onClick={() => setSelectedId(finding.id)}
                    className={cn(
                      'focus-ring block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/60',
                      finding.id === selectedId && 'bg-primary/10',
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <SeverityDot severity={finding.severity} />
                      <span>{formatMessage(finding.title)}</span>
                      {finding.confidence === 'ai' ? (
                        <Badge tone="accent">{t('analysis.confidence.ai')}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      <span className="font-mono">{finding.rule}</span>
                      <span>{t(CONFIDENCE_KEY[finding.confidence])}</span>
                      {finding.ai ? (
                        <span className={VERDICT_CLASS[finding.ai.verdict]}>
                          {t(VERDICT_KEY[finding.ai.verdict])}
                        </span>
                      ) : null}
                      {finding.score !== undefined ? (
                        <span>
                          {t('analysis.similarity', { value: Math.round(finding.score * 100) })}
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      <section className="min-h-0 overflow-y-auto">
        {running ? (
          <EvaluationProcess events={processEvents} />
        ) : selected ? (
          <FindingDetail
            finding={selected}
            severityLabel={severityLabel}
            scopeLabel={scopeLabel}
          />
        ) : selectedId === OVERVIEW_ID && evaluation ? (
          <EvaluationOverview evaluation={evaluation} scopeLabel={scopeLabel} />
        ) : evaluation === null && visible.length === 0 ? (
          <EmptyState>{t('analysis.aiEmpty')}</EmptyState>
        ) : (
          <EmptyState>{t('analysis.selectHint')}</EmptyState>
        )}
      </section>
    </div>
  );
}

function FindingDetail({
  finding,
  severityLabel,
  scopeLabel,
}: {
  finding: Finding;
  severityLabel: Record<string, string>;
  scopeLabel: (scope: 'global' | 'project', projectPath?: string) => string;
}): React.ReactElement {
  const { t, formatMessage } = useI18n();
  return (
    <div className="max-w-[900px] px-4 pt-4 pb-10">
      <h1 className="text-xl font-semibold">{formatMessage(finding.title)}</h1>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{severityLabel[finding.severity]}</Badge>
        <Badge>{finding.rule}</Badge>
        <Badge>{t(CONFIDENCE_KEY[finding.confidence])}</Badge>
        {finding.ai ? (
          <Badge tone={VERDICT_TONE[finding.ai.verdict]}>{t(VERDICT_KEY[finding.ai.verdict])}</Badge>
        ) : null}
      </div>

      <Section title={t('analysis.detailHeading')}>
        <div className="max-w-[65ch]">{formatMessage(finding.detail)}</div>
      </Section>

      {finding.suggestion ? (
        <Section title={t('analysis.suggestionHeading')}>
          <div className="max-w-[65ch] text-muted-foreground">
            {formatMessage(finding.suggestion)}
          </div>
        </Section>
      ) : null}

      {finding.ai ? (
        <Section title={t('analysis.aiNote')}>
          {finding.ai.detail ? (
            <div className="max-w-[65ch] text-muted-foreground">{finding.ai.detail}</div>
          ) : null}
          {finding.ai.suggestion ? (
            <div className="mt-1 max-w-[65ch] text-muted-foreground">{finding.ai.suggestion}</div>
          ) : null}
        </Section>
      ) : null}

      {finding.evidence.length > 0 ? (
        <Section title={t('analysis.evidenceHeading')}>
          <div className="flex flex-col gap-1">
            {finding.evidence.map((item) => (
              <div key={item} className="font-mono text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {finding.skills.length > 0 ? (
        <Section title={t('analysis.skillsHeading')}>
          <div className="flex flex-col gap-1">
            {finding.skills.map((skill) => (
              <div key={recordKey(skill)} className="text-muted-foreground">
                {t('analysis.skillScope', {
                  name: skill.name,
                  scope: scopeLabel(skill.scope, skill.projectPath),
                })}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function EvaluationOverview({
  evaluation,
  scopeLabel,
}: {
  evaluation: EvaluationReport;
  scopeLabel: (scope: 'global' | 'project', projectPath?: string) => string;
}): React.ReactElement {
  const { t, relativeTime } = useI18n();
  return (
    <div className="max-w-[900px] px-4 pt-4 pb-10">
      <h1 className="text-xl font-semibold">{t('analysis.aiOverview')}</h1>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">
          {t('analysis.aiAverage')} {evaluation.averageScore}
        </Badge>
        <Badge>{evaluation.model}</Badge>
        <Badge>{relativeTime(evaluation.generatedAt)}</Badge>
      </div>

      <Section title={t('analysis.aiSummary')}>
        <div className="max-w-[65ch] text-muted-foreground">{evaluation.summary}</div>
      </Section>

      <Section title={t('analysis.aiScores', { count: evaluation.scores.length })}>
        <div className="flex flex-col gap-2">
          {evaluation.scores.map((entry) => (
            <div key={recordKey(entry.skill)} className="rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{entry.skill.name}</span>
                <Badge tone="accent">{entry.grade}</Badge>
                <span className="tabular-nums text-muted-foreground">{entry.score}</span>
                <span className="text-[11px] text-muted-foreground">
                  {scopeLabel(entry.skill.scope, entry.skill.projectPath)}
                </span>
              </div>
              {entry.summary ? (
                <div className="mt-1 text-muted-foreground">{entry.summary}</div>
              ) : null}
              {entry.strengths.length > 0 ? (
                <div className="mt-1 text-[11px] text-success">
                  {t('analysis.aiStrengths')}: {entry.strengths.join('；')}
                </div>
              ) : null}
              {entry.issues.length > 0 ? (
                <div className="mt-1 text-[11px] text-warning">
                  {t('analysis.aiSkillIssues')}: {entry.issues.join('；')}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
