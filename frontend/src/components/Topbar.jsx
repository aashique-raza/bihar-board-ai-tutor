import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import React from 'react';
import { useAuth } from '../hooks/useAuth.js';

export default function Topbar({
  theme,
  onToggleTheme,
  selectedChapter,
  isFocusLoading,
  onOpenFocus,
  onClearFocus,
}) {
  const { user, isLoggedIn, isLoading } = useAuth();

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '54px',
        px: { xs: 2, sm: 3 },
        bgcolor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: 2,
      }}
    >
      {/* Left: Logo + wordmark */}
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box className="zuno-logo">Z</Box>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '1rem',
            color: 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          Zuno
        </Typography>
      </Stack>

      {/* Right: chapter pill + focus button + theme toggle */}
      <Stack direction="row" spacing={1} alignItems="center">
        {/* Chapter pill — hidden on mobile */}
        {selectedChapter && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              maxWidth: 220,
              px: '10px',
              pl: '8px',
              py: '4px',
              border: '1px solid var(--primary-border)',
              borderRadius: 'var(--radius-full)',
              bgcolor: 'var(--primary-tint)',
              overflow: 'hidden',
            }}
          >
            {/* Dot */}
            <Box
              sx={{
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: '50%',
                bgcolor: 'var(--primary)',
              }}
            />
            {/* Title */}
            <Typography
              sx={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--primary-label)',
                maxWidth: 160,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.3,
              }}
            >
              {selectedChapter.title}
            </Typography>
            {/* Clear */}
            <IconButton
              size="small"
              onClick={onClearFocus}
              sx={{ padding: '2px', color: 'var(--primary-label)' }}
            >
              <CloseRounded sx={{ fontSize: '14px' }} />
            </IconButton>
          </Stack>
        )}

        {/* Focus button */}
        <Button
          variant="outlined"
          size="small"
          disabled={isFocusLoading}
          onClick={onOpenFocus}
          sx={{
            borderColor: 'var(--border-strong)',
            color: 'var(--text-secondary)',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.8rem',
            fontWeight: 600,
            px: 1.5,
            py: 0.5,
            textTransform: 'none',
            '&:hover': {
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
              bgcolor: 'transparent',
            },
          }}
        >
          Focus
        </Button>

        {/* Auth slot */}
        {!isLoading && (
          <>
            {isLoggedIn && user ? (
              <Box
                sx={{
                  width: 30,
                  height: 30,
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 'var(--radius-avatar)',
                  bgcolor: 'var(--primary)',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  userSelect: 'none',
                }}
              >
                {user.name?.charAt(0)?.toUpperCase() || 'U'}
              </Box>
            ) : (
              <Button
                variant="outlined"
                size="small"
                onClick={() => { window.location.href = '/login'; }}
                sx={{
                  borderColor: 'var(--border-strong)',
                  color: 'var(--text-secondary)',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  px: 1.5,
                  py: 0.5,
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: 'var(--primary)',
                    color: 'var(--primary)',
                    bgcolor: 'transparent',
                  },
                }}
              >
                Login
              </Button>
            )}
          </>
        )}

        {/* Theme toggle */}
        <IconButton
          size="small"
          onClick={onToggleTheme}
          sx={{
            color: 'var(--text-muted)',
            '&:hover': { color: 'var(--text-primary)' },
          }}
        >
          {theme === 'dark' ? (
            <LightModeRounded sx={{ fontSize: '20px' }} />
          ) : (
            <DarkModeRounded sx={{ fontSize: '20px' }} />
          )}
        </IconButton>
      </Stack>
    </Box>
  );
}
