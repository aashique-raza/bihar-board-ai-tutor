import { useState, useCallback } from 'react';

/**
 * useToast — manages toast open/close state.
 *
 * Returns:
 *   toast        — { open, message, severity }
 *   showToast    — (message, severity?) => void
 *   hideToast    — () => void
 *
 * Usage:
 *   const { toast, showToast, hideToast } = useToast();
 *   showToast('Saved!', 'success');
 *   showToast('Something went wrong.', 'error');
 */
export function useToast() {
  const [toast, setToast] = useState({
    open: false,
    message: '',
    severity: 'success',
  });

  const showToast = useCallback((message, severity = 'success') => {
    setToast({ open: true, message, severity });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, open: false }));
  }, []);

  return { toast, showToast, hideToast };
}
