import { useState, useEffect } from 'react';

const STORAGE_KEY = 'zuno.sidebarCollapsed';

// Defaults to collapsed (icon rail) — matches the approved design direction.
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return [collapsed, setCollapsed];
}
