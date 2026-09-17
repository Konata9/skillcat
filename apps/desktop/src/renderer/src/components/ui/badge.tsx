import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/utils';

export const badgeVariants = cva(
  // deslop-ignore-next-line 19: 标签胶囊是 chip 的约定，不是按钮/输入框的 max-radius
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap',
  {
    variants: {
      tone: {
        default: 'border-input text-muted-foreground',
        accent: 'border-primary/40 text-primary',
        success: 'border-success/40 text-success',
        warn: 'border-warning/40 text-warning',
        error: 'border-destructive/40 text-destructive',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps): React.ReactElement {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
