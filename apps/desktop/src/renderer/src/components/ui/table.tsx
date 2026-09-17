import * as React from 'react';
import { cn } from '@renderer/lib/utils';

export function Table({ className, ...props }: React.ComponentProps<'table'>): React.ReactElement {
  return <table className={cn('w-full border-collapse text-[13px]', className)} {...props} />;
}

export function TableHeader({
  className,
  ...props
}: React.ComponentProps<'thead'>): React.ReactElement {
  return <thead className={cn(className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.ComponentProps<'tbody'>): React.ReactElement {
  return <tbody className={cn(className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>): React.ReactElement {
  return <tr className={cn('transition-colors hover:bg-accent/40', className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ComponentProps<'th'>): React.ReactElement {
  return (
    <th
      className={cn(
        'section-label border-b border-border px-2.5 py-2 text-left',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<'td'>): React.ReactElement {
  return <td className={cn('border-b border-border px-2.5 py-2 align-middle', className)} {...props} />;
}
