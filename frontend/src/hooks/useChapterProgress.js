import { useEffect, useRef, useState } from 'react';
import { listChapterProgress } from '../api/tutorApi.js';

const CACHE_TTL_MS = 30_000;
const EVENT_NAME = 'chapter-progress-updated';

// Module-level cache: survives re-renders, shared across all hook instances.
// Key: 'in_progress' | 'completed' | 'all'
const cache = {};

/**
 * Fetches and caches in-progress chapter progress list with a 30s TTL.
 * Invalidates automatically when a 'chapter-progress-updated' CustomEvent fires.
 *
 * Usage:
 *   const { inProgressChapters, isLoading } = useChapterProgress();
 */
export function useChapterProgress() {
  const [inProgressChapters, setInProgressChapters] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  const load = async () => {
    const now = Date.now();
    const cached = cache['in_progress'];
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      setInProgressChapters(cached.data);
      return;
    }

    setIsLoading(true);
    try {
      const result = await listChapterProgress({ status: 'in_progress', limit: 10 });
      const chapters = result?.chapters ?? [];
      cache['in_progress'] = { data: chapters, ts: Date.now() };
      if (mountedRef.current) setInProgressChapters(chapters);
    } catch {
      // Silently swallow — FocusModal degrades gracefully if this fails
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();

    const handleInvalidate = () => {
      delete cache['in_progress'];
      load();
    };

    window.addEventListener(EVENT_NAME, handleInvalidate);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(EVENT_NAME, handleInvalidate);
    };
  }, []);

  return { inProgressChapters, isLoading };
}
