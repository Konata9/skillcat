import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { SkillRecord } from '@skillman/core';
import { recordKey } from '@skillman/core/keys';
import { useI18n } from '@renderer/lib/i18n';
import { SkillDetail, type SkillDetailActions } from '../components/SkillDetail';
import { SkillList } from '../components/SkillList';
import { EmptyState } from '../components/indicators';
import { Input } from '../components/ui/input';

export function SkillsView({
  records,
  onOpen,
  onReveal,
  onEditTriggers,
  onUpdate,
  onRemove,
}: { records: SkillRecord[] } & SkillDetailActions): React.ReactElement {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedKey(null);
      return;
    }
    const exists = filtered.some((record) => recordKey(record) === selectedKey);
    if (!exists) setSelectedKey(recordKey(filtered[0]!));
  }, [filtered, selectedKey]);

  const selected = filtered.find((record) => recordKey(record) === selectedKey);

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
      <section className="min-h-0 overflow-y-auto">
        {selected ? (
          <SkillDetail
            record={selected}
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
