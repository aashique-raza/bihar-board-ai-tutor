/**
 * useTheme.js
 * Dark mode toggle hook for Zuno.
 * Reads/writes localStorage key: 'zuno-theme'
 * Sets data-theme attribute on <html> element.
 *
 * Usage:
 *   const { theme, toggleTheme } = useTheme();
 *   // theme: 'light' | 'dark'
 *   // toggleTheme: () => void
 */
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'zuno-theme';
const DARK = 'dark';
const LIGHT = 'light';

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === DARK || saved === LIGHT) return saved;
    // Fall back to OS preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return DARK;
  } catch (e) {
    // localStorage blocked (private mode etc.)
  }
  return LIGHT;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }, [theme]);

  function toggleTheme() {
    setTheme(prev => (prev === DARK ? LIGHT : DARK));
  }

  return { theme, toggleTheme };
}
