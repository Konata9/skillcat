import * as React from 'react';
import { cn } from '@renderer/lib/utils';

/** Titled content block used across detail panels. */
export function Section({
  title,
  level = 'h2',
  headingClassName = 'mb-2',
  children,
}: {
  title: React.ReactNode;
  level?: 'h2' | 'h3';
  headingClassName?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const Heading = level;
  return (
    <section className="mt-5">
      <Heading className={cn('section-label', headingClassName)}>{title}</Heading>
      {children}
    </section>
  );
}
