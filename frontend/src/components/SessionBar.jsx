import React from 'react';
import Box from '@mui/material/Box';

export default function SessionBar({ sessionCount, currentSessionTitle, triggerRef, onOpenHistory, onNewChat }) {
  return (
    <Box
      component="nav"
      aria-label="Session navigation"
      sx={{
        display: 'flex',
        alignItems: 'center',
        height: '38px',
        px: { xs: 2, sm: 3 },
        gap: 1,
        bgcolor: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {/* Chats trigger — left */}
      <Box
        ref={triggerRef}
        component="button"
        onClick={onOpenHistory}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-full)',
          px: '10px',
          py: '4px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          flexShrink: 0,
          fontFamily: 'inherit',
          lineHeight: 1,
          transition: 'border-color 0.15s ease, background 0.15s ease',
          '&:hover': { borderColor: 'var(--border-strong)', background: 'var(--bg-hover)' },
          '&:focus-visible': { outline: '2px solid var(--primary)', outlineOffset: '2px' },
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 15" />
        </svg>
        Chats
        {sessionCount > 0 && (
          <Box
            component="span"
            sx={{
              background: 'var(--primary)',
              color: '#fff',
              borderRadius: 'var(--radius-full)',
              px: '5px',
              fontSize: '0.65rem',
              fontWeight: 800,
              lineHeight: '16px',
              minWidth: '16px',
              textAlign: 'center',
              display: 'inline-block',
            }}
          >
            {sessionCount > 99 ? '99+' : sessionCount}
          </Box>
        )}
      </Box>

      {/* Current session name — center, truncated */}
      <Box
        sx={{
          flex: 1,
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          px: 1,
          userSelect: 'none',
        }}
      >
        {currentSessionTitle || ''}
      </Box>

      {/* New Chat — right */}
      <Box
        component="button"
        onClick={onNewChat}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          background: 'var(--primary-tint)',
          border: '1px solid var(--primary-border)',
          borderRadius: 'var(--radius-full)',
          px: '10px',
          py: '4px',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--primary-label)',
          cursor: 'pointer',
          flexShrink: 0,
          fontFamily: 'inherit',
          lineHeight: 1,
          transition: 'background 0.15s ease',
          '&:hover': { background: '#FDE9C0' },
          '&:focus-visible': { outline: '2px solid var(--primary)', outlineOffset: '2px' },
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New
      </Box>
    </Box>
  );
}
