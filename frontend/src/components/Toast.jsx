import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

/**
 * Toast — lightweight notification component.
 *
 * Props:
 *   open      boolean  — whether toast is visible
 *   message   string   — text to show
 *   severity  string   — 'success' | 'error' | 'info' | 'warning'
 *   onClose   fn       — called when toast closes (auto or manual)
 *   duration  number   — auto-hide duration in ms (default 4000)
 */
export default function Toast({
  open,
  message,
  severity = 'success',
  onClose,
  duration = 4000,
}) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={duration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        variant="filled"
        sx={{
          width: '100%',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.875rem',
          fontWeight: 500,
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
