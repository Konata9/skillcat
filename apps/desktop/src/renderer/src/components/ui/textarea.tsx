import * as React from 'react';
import { cn } from '@renderer/lib/utils';

export function Textarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>): React.ReactElement {
  return (
    <textarea
      className={cn(
        'w-full min-w-0 rounded-md border border-input bg-secondary px-2.5 py-1.5 text-[13px] outline-none transition-colors',
        'placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
