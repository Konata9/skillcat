import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { SkillOptimization, SkillRecord } from '@skillcat/core';
import { recordKey } from '@skillcat/core/keys';
import { useSelection } from '@renderer/hooks/useSelection';
import { useI18n } from '@renderer/lib/i18n';
import {
  SkillDetail,
  type SkillDetailActions,
  type SkillDetailTab,
} from '../components/skill-detail/SkillDetail';
import { SkillList } from '../components/SkillList';
import { EmptyState } from '../components/indicators';
import { Input } from '../components/ui/input';

export function SkillsView({
  records,
  activityCounts,
  llmConfigured,
  optimizations,
  optimizingKey,
  optimizationError,
  onOptimize,
  onOpenSettings,
  onOpen,
  onReveal,
  onEditTriggers,
  onUpdate,
  onRemove,
}: {
  records: SkillRecord[];
  activityCounts?: Record<string, number>;
  llmConfigured: boolean;
  optimizations: SkillOptimization[];
  optimizingKey: string | null;
  optimizationError: string | null;
  onOptimize: (record: SkillRecord) => void;
  onOpenSettings: () => void;
} & SkillDetailActions): React.ReactElement {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [detailTab, setDetailTab] = useState<SkillDetailTab>('info');

  const optimizationByKey = useMemo(
    () => new Map(optimizations.map((entry) => [recordKey(entry.skill), entry])),
    [optimizations],
  );

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => {
      if (record.name.toLowerCase().includes(query)) return true;
      if (record.description.toLowerCase().includes(query)) return true;
      if ((record.source ?? '').toLowerCase().includes(query)) return true;
      return record.triggers.positive.some((term) => term.text.toLowerCase().includes(query));
    });
  }, [records, filter]);

  const { selectedKey, setSelectedKey, selected } = useSelection({
    items: filtered,
    getKey: recordKey,
  });

  // A newly selected skill always opens on the regular detail tab.
  useEffect(() => {
    setDetailTab('info');
  }, [selectedKey]);

  return (
    <div className="grid min-h-0 flex-1 grid-rows-1 grid-cols-[minmax(320px,42%)_1fr]">
      <section className="flex min-h-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-2">
          <Input
            type="search"
            className="h-7"
            placeholder={t('skills.filterPlaceholder')}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {filtered.length}/{records.length}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SkillList
            records={filtered}
            selectedKey={selectedKey}
            filterActive={filter.trim().length > 0}
            onSelect={(record) => setSelectedKey(recordKey(record))}
          />
        </div>
      </section>
      <section className="flex min-h-0 flex-col">
        {selected ? (
          <SkillDetail
            record={selected}
            triggerCount={activityCounts?.[recordKey(selected)]}
            optimization={optimizationByKey.get(recordKey(selected)) ?? null}
            optimizing={optimizingKey === recordKey(selected)}
            optimizationError={optimizationError}
            llmConfigured={llmConfigured}
            tab={detailTab}
            onTabChange={setDetailTab}
            onOptimize={onOptimize}
            onOpenSettings={onOpenSettings}
            onOpen={onOpen}
            onReveal={onReveal}
            onEditTriggers={onEditTriggers}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ) : (
          <EmptyState>{t('skills.selectHint')}</EmptyState>
        )}
      </section>
    </div>
  );
}
