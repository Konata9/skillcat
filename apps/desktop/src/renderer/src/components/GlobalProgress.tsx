import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@renderer/lib/i18n';

/**
 * Minimum time the bar stays on screen once shown, so a scan that finishes in
 * a few milliseconds is still perceptible instead of flashing by unseen.
 */
const MIN_VISIBLE_MS = 650;

/**
 * Indeterminate top progress bar for global (snapshot) loading. Shown on the
 * first scan and every refresh.
 */
export function GlobalProgress({ active }: { active: boolean }): React.ReactElement | null {
  const { t } = useI18n();
  const [visible, setVisible] = useState(active);
  const shownAtRef = useRef<number | null>(active ? Date.now() : null);

  useEffect(() => {
    if (active) {
      shownAtRef.current = Date.now();
      setVisible(true);
      return;
    }
    const shownAt = shownAtRef.current;
    const remaining = shownAt === null ? 0 : MIN_VISIBLE_MS - (Date.now() - shownAt);
    if (remaining <= 0) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible) return null;
  return (
    <div
      role="progressbar"
      aria-label={t('app.scanning')}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-primary/15"
    >
      <div className="h-full w-1/3 animate-[progress-slide_1s_ease-in-out_infinite] rounded-full bg-primary" />
    </div>
  );
}
