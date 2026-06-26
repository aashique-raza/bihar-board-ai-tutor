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
          fontWeight: 600,
          boxShadow: 'var(--shadow-md)',
          fontFamily: 'var(--font-body)',
          // Custom Zuno styling overrides for standard MUI severity colors
          bgcolor: severity === 'success' ? 'var(--primary-tint)' : 
                   severity === 'error' ? 'var(--error)' : 'var(--bg-surface)',
          color: severity === 'success' ? 'var(--primary-label)' :
                 severity === 'error' ? '#ffffff' : 'var(--text-primary)',
          border: severity === 'success' ? '1px solid var(--primary-border)' : 'none',
          '& .MuiAlert-icon': {
            color: severity === 'success' ? 'var(--primary)' : '#ffffff',
          }
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
