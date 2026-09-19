import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'skillcat-theme';
const LEGACY_STORAGE_KEY = 'skillman-theme';

export function getStoredTheme(): Theme {
  try {
    const value =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch {
    // storage unavailable: fall back to the default
  }
  return 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore storage failures
    }
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((current) => (current === 'light' ? 'dark' : 'light')),
  };
}
