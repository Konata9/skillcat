import * as React from 'react';
// deslop-ignore-file 34: 抽屉展示的是 CLI 原始输出，等宽字体是内容本身的要求
import { useEffect, useRef } from 'react';
import { useI18n } from '@renderer/lib/i18n';
import { Button } from './ui/button';
import { cn } from '@renderer/lib/utils';

export interface OpState {
  opId: string;
  title: string;
  lines: string[];
  done: boolean;
  ok: boolean | null;
}

export function OperationDrawer({
  op,
  onCancel,
  onClose,
}: {
  op: OpState;
  onCancel: () => void;
  onClose: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const element = preRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [op.lines.length]);

  return (
    <div className="flex max-h-60 flex-col border-t border-input bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2">
        <span
          className={cn(
            // deslop-ignore-next-line 19: 状态指示点必须是圆形
            'size-[7px] shrink-0 rounded-full',
            op.done ? (op.ok ? 'bg-success' : 'bg-destructive') : 'bg-primary',
          )}
        />
        <strong className="font-semibold">{op.title}</strong>
        <span className="text-muted-foreground">
          {op.done ? (op.ok ? t('op.done') : t('op.failed')) : t('op.running')}
        </span>
        <div className="flex-1" />
        {op.done ? (
          <Button size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <Button size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
      <pre
        ref={preRef}
        className="overflow-auto px-3.5 py-2.5 font-mono text-[11px] leading-normal whitespace-pre-wrap text-muted-foreground"
      >
        {op.lines.length > 0 ? op.lines.join('\n') : t('op.waiting')}
      </pre>
    </div>
  );
}
