import * as React from 'react';
import { cn } from '@renderer/lib/utils';

export function Tooltip({
  content,
  triggerLabel,
  children,
  className,
}: {
  content: React.ReactNode;
  triggerLabel: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <span className={cn('group/tooltip relative inline-flex items-center', className)}>
      <button
        type="button"
        aria-label={triggerLabel}
        className="focus-ring inline-flex cursor-help items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 hidden w-64 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-2 text-left text-[11px] leading-4 font-normal text-popover-foreground shadow-lg group-hover/tooltip:block group-focus-within/tooltip:block"
      >
        {content}
      </span>
    </span>
  );
}
