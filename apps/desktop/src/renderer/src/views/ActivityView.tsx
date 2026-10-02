/**
 * Runtime activity log: which agent triggered which SKILL, with what phrase and
 * task, plus count aggregates and charts. All data comes from the core's
 * matched, persisted events; this view only filters and renders.
 */
import * as React from 'react';
import { useMemo, useState } from 'react';
import type { ActivityStats, RuntimeSkillEvent } from '@skillcat/core';
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '@renderer/lib/i18n';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/indicators';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const PALETTE = [
  '#6366f1',
  '#0ea5e9',
  '#14b8a6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#22c55e',
  '#ec4899',
];

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_OPTIONS = [7, 30, 90, 180, 360];
const MAX_ROWS = 500;

function StatCard({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="section-label mb-2">{title}</div>
      {children}
    </div>
  );
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function ActivityView({
  events,
  stats,
  onClear,
}: {
  events: RuntimeSkillEvent[];
  stats: ActivityStats | null;
  onClear: () => Promise<void>;
}): React.ReactElement {
  const { t, relativeTime } = useI18n();
  const [agent, setAgent] = useState('all');
  const [skill, setSkill] = useState('all');
  const [task, setTask] = useState('all');
  const [source, setSource] = useState('all');
  const [days, setDays] = useState(90);
  const [confirmClear, setConfirmClear] = useState(false);

  const agents = useMemo(() => unique(events.map((event) => event.agentDisplay)), [events]);
  const skills = useMemo(() => unique(events.map((event) => event.skillName)), [events]);
  const tasks = useMemo(() => unique(events.map((event) => event.task ?? '')), [events]);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - days * DAY_MS;
    return events
      .filter((event) => new Date(event.at).getTime() >= cutoff)
      .filter((event) => agent === 'all' || event.agentDisplay === agent)
      .filter((event) => skill === 'all' || event.skillName === skill)
      .filter((event) => task === 'all' || (event.task ?? '') === task)
      .filter((event) => source === 'all' || event.source === source)
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [events, agent, skill, task, source, days]);

  const trend = useMemo(() => {
    const cutoffDay = new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
    return (stats?.byDay ?? []).filter((entry) => entry.day >= cutoffDay);
  }, [stats, days]);

  const topSkills = useMemo(
    () => (stats?.bySkill ?? []).slice(0, 10).map((entry) => ({ name: entry.label, count: entry.count })),
    [stats],
  );
  const agentShare = useMemo(
    () => (stats?.byAgent ?? []).map((entry) => ({ name: entry.label, value: entry.count })),
    [stats],
  );

  const matchRate =
    stats && stats.total + stats.unmatched > 0
      ? Math.round((stats.total / (stats.total + stats.unmatched)) * 100)
      : 100;

  if (!stats || stats.total === 0) {
    return (
      <EmptyState>
        <div className="font-medium text-foreground">{t('activity.empty')}</div>
        <div className="mt-1 max-w-[52ch] text-[12px]">{t('activity.emptyHint')}</div>
      </EmptyState>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-muted-foreground">{t('activity.subtitle')}</div>
        <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
          {t('activity.clear')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard label={t('activity.stat.total')} value={String(stats.total)} />
        <StatCard label={t('activity.stat.skills')} value={String(stats.uniqueSkills)} />
        <StatCard label={t('activity.stat.agents')} value={String(stats.activeAgents)} />
        <StatCard label={t('activity.stat.matchRate')} value={`${matchRate}%`} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title={t('activity.chart.trend')}>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  name={t('activity.chart.count')}
                  stroke={PALETTE[0]}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={t('activity.chart.topSkills')}>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topSkills}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
              >
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip />
                <Bar dataKey="count" name={t('activity.chart.count')} fill={PALETTE[1]} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={t('activity.chart.agents')}>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={agentShare} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                  {agentShare.map((entry, index) => (
                    <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={t('activity.conflicts')}>
          <div className="mb-1.5 text-[11px] text-muted-foreground">
            {t('activity.conflictsHint')}
          </div>
          {stats.phraseConflicts.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">{t('activity.conflictsNone')}</div>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[12px]">
              {stats.phraseConflicts.slice(0, 6).map((conflict) => (
                <li key={conflict.phrase} className="border-l-2 border-border pl-2">
                  <div className="line-clamp-2 text-muted-foreground">“{conflict.phrase}”</div>
                  <div className="text-[11px] text-muted-foreground/80">
                    {conflict.skills.join(' · ')} ×{conflict.count}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={agent} onChange={(event) => setAgent(event.target.value)}>
          <option value="all">{t('activity.filterAgent')}: {t('activity.all')}</option>
          {agents.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select value={skill} onChange={(event) => setSkill(event.target.value)}>
          <option value="all">{t('activity.filterSkill')}: {t('activity.all')}</option>
          {skills.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select value={task} onChange={(event) => setTask(event.target.value)}>
          <option value="all">{t('activity.filterTask')}: {t('activity.all')}</option>
          {tasks.map((value) => (
            <option key={value || '__none__'} value={value}>
              {value || t('activity.taskNone')}
            </option>
          ))}
        </Select>
        <Select value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="all">{t('activity.filterSource')}: {t('activity.all')}</option>
          <option value="model">{t('activity.source.model')}</option>
          <option value="user">{t('activity.source.user')}</option>
        </Select>
        <Select value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>
          {RANGE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t('activity.rangeDays', { n: value })}
            </option>
          ))}
        </Select>
        <span className="text-[11px] text-muted-foreground">
          {filtered.length}/{events.length}
        </span>
      </div>

      <div className="mt-2 overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[110px]">{t('activity.table.time')}</TableHead>
              <TableHead className="w-[110px]">{t('activity.table.agent')}</TableHead>
              <TableHead className="w-[180px]">{t('activity.table.task')}</TableHead>
              <TableHead className="w-[160px]">{t('activity.table.skill')}</TableHead>
              <TableHead>{t('activity.table.phrase')}</TableHead>
              <TableHead className="w-[120px]">{t('activity.table.project')}</TableHead>
              <TableHead className="w-[90px]">{t('activity.table.source')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, MAX_ROWS).map((event) => (
              <TableRow key={event.id}>
                <TableCell className="text-muted-foreground" title={event.at}>
                  {relativeTime(event.at)}
                </TableCell>
                <TableCell className="text-muted-foreground">{event.agentDisplay}</TableCell>
                <TableCell className="max-w-[180px] truncate text-muted-foreground" title={event.task ?? ''}>
                  {event.task ?? t('activity.taskNone')}
                </TableCell>
                <TableCell className="font-medium">{event.skillName}</TableCell>
                <TableCell className="max-w-[360px]">
                  {event.phrase ? (
                    <span className="block truncate text-muted-foreground" title={event.phrase}>
                      {event.phrase}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {event.triggerTerm ? (
                    <span className="text-[11px] text-primary/80">
                      {t('activity.triggerTerm', { term: event.triggerTerm })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell
                  className="max-w-[120px] truncate font-mono text-[11px] text-muted-foreground"
                  title={event.projectPath ?? ''}
                >
                  {event.projectPath ?? t('activity.projectGlobal')}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {event.source === 'user' ? t('activity.source.user') : t('activity.source.model')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {confirmClear ? (
        <ConfirmDialog
          title={t('activity.clearTitle')}
          confirmLabel={t('activity.clear')}
          danger
          onConfirm={() => {
            setConfirmClear(false);
            void onClear();
          }}
          onClose={() => setConfirmClear(false)}
        >
          {t('activity.clearBody', { count: events.length })}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
