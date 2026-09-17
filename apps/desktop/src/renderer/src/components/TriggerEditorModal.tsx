import * as React from 'react';
import { useMemo, useState } from 'react';
import type { Annotation, SkillRecord } from '@skillman/core';
import { useI18n } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Select } from './ui/select';

interface Row {
  key: string;
  kind: 'positive' | 'negative';
  text: string;
  norm: string;
  user: boolean;
  removed: boolean;
}

export function TriggerEditorModal({
  record,
  annotation,
  onSave,
  onClose,
}: {
  record: SkillRecord;
  annotation: Annotation | null;
  onSave: (annotation: Annotation | null) => void;
  onClose: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  const [added, setAdded] = useState<Array<{ text: string; kind: 'positive' | 'negative' }>>(
    annotation?.added ?? [],
  );
  const [removed, setRemoved] = useState<string[]>(annotation?.removed ?? []);
  const [draft, setDraft] = useState('');
  const [draftKind, setDraftKind] = useState<'positive' | 'negative'>('positive');

  const rows = useMemo<Row[]>(() => {
    const builtIn: Row[] = [
      ...record.triggers.positive.filter((term) => !term.user),
      ...record.triggers.negative.filter((term) => !term.user),
    ].map((term) => ({
      key: `${term.kind}:${term.norm}`,
      kind: term.kind,
      text: term.text,
      norm: term.norm,
      user: false,
      removed: removed.includes(term.norm),
    }));
    const userRows: Row[] = added.map((item, index) => ({
      key: `user:${index}:${item.text}`,
      kind: item.kind,
      text: item.text,
      norm: item.text.toLowerCase(),
      user: true,
      removed: false,
    }));
    return [...builtIn, ...userRows];
  }, [record, added, removed]);

  const addDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setAdded((current) => [...current, { text, kind: draftKind }]);
    setDraft('');
  };

  const toggleRow = (row: Row) => {
    if (row.user) {
      setAdded((current) => current.filter((item) => item.text !== row.text));
    } else if (row.removed) {
      setRemoved((current) => current.filter((item) => item !== row.norm));
    } else {
      setRemoved((current) => [...current, row.norm]);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('editor.title', { name: record.name })}</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          <p className="text-[11px] text-muted-foreground">{t('editor.hint')}</p>

          <div className="flex items-center gap-2">
            <Select
              value={draftKind}
              onChange={(event) => setDraftKind(event.target.value as 'positive' | 'negative')}
            >
              <option value="positive">{t('editor.positive')}</option>
              <option value="negative">{t('editor.negative')}</option>
            </Select>
            <Input
              placeholder={t('editor.placeholder')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addDraft();
              }}
            />
            <Button onClick={addDraft}>{t('common.add')}</Button>
          </div>

          <div className="flex flex-col gap-1">
            {rows.length === 0 ? (
              <div className="text-muted-foreground">{t('editor.empty')}</div>
            ) : null}
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-2 py-0.5">
                <div className="flex items-center gap-2">
                  <span className={row.kind === 'positive' ? '' : 'text-destructive'}>
                    {row.kind === 'positive' ? '+' : '−'}
                  </span>
                  {/* deslop-ignore-next-line 09: 删除线表示用户已禁用该触发词，是真实标注而非装饰 */}
                  <span className={cn(row.removed && 'text-muted-foreground line-through')}>
                    {row.text}
                  </span>
                  {row.user ? <Badge tone="warn">{t('badge.user')}</Badge> : null}
                  {row.removed ? <Badge tone="error">{t('badge.removed')}</Badge> : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleRow(row)}>
                  {row.user
                    ? t('editor.remove')
                    : row.removed
                      ? t('editor.restore')
                      : t('editor.disable')}
                </Button>
              </div>
            ))}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const meaningful = added.length > 0 || removed.length > 0;
              onSave(meaningful ? { added, removed } : null);
            }}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
