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
      // A chapter waiting on its gate quiz is still "unfinished" from the student's
      // point of view — fetched alongside in_progress so it doesn't vanish from
      // "Jahan Chhoda Tha" the moment the last topic is done (same reasoning as the
      // backend's inProgressCount — see chapterProgress.controller.js summary logic).
      const [inProgress, awaitingQuiz] = await Promise.all([
        listChapterProgress({ status: 'in_progress', limit: 10 }),
        listChapterProgress({ status: 'awaiting_quiz', limit: 10 }),
      ]);
      const chapters = [...(inProgress?.chapters ?? []), ...(awaitingQuiz?.chapters ?? [])]
        .sort((a, b) => new Date(b.lastStudiedAt) - new Date(a.lastStudiedAt));
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
