import { useEffect } from 'react';

// Dark mode removed — Zuno is light-mode only for now.
export function useTheme() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-color-scheme', 'light');
  }, []);

  return { theme: 'light', toggleTheme: () => {} };
}
