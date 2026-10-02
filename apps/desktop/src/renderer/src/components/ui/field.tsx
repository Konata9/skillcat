import * as React from 'react';

/** Label + control column used by the settings forms. */
export function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1 text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
