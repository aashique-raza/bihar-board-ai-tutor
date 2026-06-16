import { useState, useRef, useCallback } from 'react';
import { fetchSessions } from '../api/tutorApi.js';

export default function useSessionList({ enabled }) {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const hasFetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSessions();
      setSessions(result?.sessions ?? []);
    } catch {
      setError('Sessions load nahi hui.');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  // Panel pehli baar khule tab sirf ek baar fetch.
  // enabled: false (guest) → hasFetchedRef never sets → always a no-op for guests.
  const fetchOnce = useCallback(() => {
    if (hasFetchedRef.current || !enabled) return;
    hasFetchedRef.current = true;
    refresh();
  }, [enabled, refresh]);

  return { sessions, isLoading, error, refresh, fetchOnce };
}
