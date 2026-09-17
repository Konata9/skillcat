import * as React from 'react';
import { cn } from '@renderer/lib/utils';

export function Select({
  className,
  ...props
}: React.ComponentProps<'select'>): React.ReactElement {
  return (
    <select
      className={cn(
        'h-8 min-w-0 rounded-md border border-input bg-secondary px-2 text-[13px] outline-none transition-colors',
        'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
