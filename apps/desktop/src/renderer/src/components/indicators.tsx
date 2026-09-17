import * as React from 'react';
import { cn } from '@renderer/lib/utils';

const SEVERITY_CLASS = {
  error: 'bg-destructive',
  warn: 'bg-warning',
  info: 'bg-primary',
} as const;

export function SeverityDot({
  severity,
  className,
}: {
  severity: keyof typeof SEVERITY_CLASS;
  className?: string;
}): React.ReactElement {
  return (
    <span
      className={cn(
        // deslop-ignore-next-line 19: 状态指示点必须是圆形
        'inline-block size-[7px] shrink-0 rounded-full',
        SEVERITY_CLASS[severity],
        className,
      )}
    />
  );
}

export function EmptyState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={cn('px-5 py-10 text-center text-muted-foreground', className)}>{children}</div>;
}
