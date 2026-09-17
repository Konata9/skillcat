import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@renderer/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-input bg-secondary text-secondary-foreground enabled:hover:border-primary',
        primary:
          'border-primary bg-primary font-semibold text-primary-foreground enabled:hover:bg-primary/90',
        outline: 'border-input bg-transparent enabled:hover:border-primary',
        ghost:
          'border-transparent text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground',
        destructive: 'border-destructive/50 text-destructive enabled:hover:bg-destructive/10',
      },
      size: {
        sm: 'h-7 px-2.5',
        default: 'h-8 px-3',
        icon: 'size-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps): React.ReactElement {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
