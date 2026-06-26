import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddCommentOutlined from '@mui/icons-material/AddCommentOutlined';
import CloseRounded from '@mui/icons-material/CloseRounded';
import React, { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { clearCredentials } from '../store/slices/authSlice.js';
import { logoutUser } from '../services/axios/authService.js';
import { clearSessionId } from '../utils/session.js';


export default function Topbar({
  selectedChapter,
  isFocusLoading,
  onOpenFocus,
  onClearFocus,
  onNewChat,
  isSessionLocked,
}) {
  const { user, isLoggedIn, isLoading } = useAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    try {
      await logoutUser();
    } catch {
      // Even if API call fails, clear local state and redirect
    }
    clearSessionId();
    localStorage.removeItem('zuno-guest-id');
    dispatch(clearCredentials());
    navigate('/');
  };

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
        <Box>
          <Typography
            sx={{
              fontFamily: 'var(--font-brand)',
              fontWeight: 800,
              fontSize: '1.05rem',
              letterSpacing: '-0.4px',
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            Zuno
          </Typography>
          <Typography
            sx={{
              fontSize: '0.67rem',
              color: 'var(--text-muted)',
              lineHeight: 1,
              mt: '2px',
              letterSpacing: '0.01em',
            }}
          >
            apni boli mein
          </Typography>
        </Box>
      </Stack>

      {/* Right: chapter pill + nav buttons + theme toggle */}
      <Stack direction="row" spacing={1} alignItems="center">

        {/* Chapter pill — shown when focus is set, hidden on mobile */}
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
            <Box
              sx={{
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: '50%',
                bgcolor: 'var(--primary)',
              }}
            />
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
            <IconButton
              size="small"
              onClick={onClearFocus}
              sx={{ padding: '2px', color: 'var(--primary-label)' }}
            >
              <CloseRounded sx={{ fontSize: '14px' }} />
            </IconButton>
          </Stack>
        )}

        {/* Focus button — colored chip treatment */}
        <Button
          size="small"
          disabled={isFocusLoading || isSessionLocked}
          onClick={onOpenFocus}
          startIcon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/>
              <circle cx="12" cy="12" r="4"/>
              <line x1="12" y1="2" x2="12" y2="6"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="6" y2="12"/>
              <line x1="18" y1="12" x2="22" y2="12"/>
            </svg>
          }
          sx={{
            bgcolor: 'var(--primary-tint)',
            border: '1px solid var(--primary-border)',
            color: 'var(--primary-label)',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.8rem',
            fontWeight: 600,
            px: 1.5,
            py: 0.5,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': {
              bgcolor: 'var(--primary-tint)',
              borderColor: 'var(--primary)',
              boxShadow: 'none',
            },
            '&.Mui-disabled': {
              bgcolor: 'var(--primary-tint)',
              borderColor: 'var(--primary-border)',
              color: 'var(--primary-label)',
              opacity: 0.5,
            },
          }}
        >
          Focus
        </Button>

        {/* New Chat — desktop: icon + text, mobile: icon only */}
        <Button
          variant={isSessionLocked ? 'contained' : 'outlined'}
          size="small"
          color={isSessionLocked ? 'primary' : 'inherit'}
          onClick={onNewChat}
          startIcon={<AddCommentOutlined sx={{ fontSize: '15px !important' }} />}
          sx={{
            borderColor: 'var(--border)',
            color: isSessionLocked ? undefined : 'var(--text-secondary)',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.8rem',
            fontWeight: 600,
            px: 1.5,
            py: 0.5,
            textTransform: 'none',
            display: { xs: 'none', sm: 'inline-flex' },
            '&:hover': {
              borderColor: 'var(--border-strong)',
              bgcolor: 'var(--bg-hover)',
            },
          }}
        >
          New Chat
        </Button>

        {/* New Chat — mobile icon only */}
        <IconButton
          size="small"
          onClick={onNewChat}
          title="New Chat"
          sx={{
            display: { xs: 'inline-flex', sm: 'none' },
            color: 'var(--text-muted)',
            '&:hover': { color: 'var(--text-primary)' },
          }}
        >
          <AddCommentOutlined sx={{ fontSize: '20px' }} />
        </IconButton>

        {/* Auth slot */}
        {!isLoading && (
          <>
            {isLoggedIn && user ? (
              /* Avatar with dropdown */
              <Box ref={menuRef} sx={{ position: 'relative' }}>
                <Box
                  onClick={() => setMenuOpen((prev) => !prev)}
                  sx={{
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 'var(--radius-avatar)',
                    bgcolor: 'var(--primary)',
                    color: 'var(--bg-page)',
                    fontFamily: 'var(--font-brand)',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    userSelect: 'none',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease',
                    '&:hover': { opacity: 0.85 },
                  }}
                >
                  {user.name?.charAt(0)?.toUpperCase() || '?'}
                </Box>

                {menuOpen && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      minWidth: 200,
                      bgcolor: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--shadow-md)',
                      overflow: 'hidden',
                      zIndex: 1000,
                    }}
                  >
                    <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid var(--border)' }}>
                      <Typography
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          lineHeight: 1.4,
                        }}
                      >
                        {user.name}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.4,
                          mt: 0.25,
                        }}
                      >
                        {user.email}
                      </Typography>
                    </Box>
                    <Box
                      onClick={handleLogout}
                      sx={{
                        px: 2,
                        py: 1.25,
                        fontSize: '0.875rem',
                        color: 'var(--error)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        '&:hover': { bgcolor: 'var(--bg-hover)' },
                        transition: 'background 0.15s ease',
                      }}
                    >
                      Logout
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              /* Login — filled primary CTA */
              <Button
                size="small"
                onClick={() => navigate('/login')}
                sx={{
                  bgcolor: 'var(--primary)',
                  color: 'var(--bg-page)',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  px: 1.75,
                  py: 0.5,
                  textTransform: 'none',
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor: 'var(--primary-hover)',
                    boxShadow: 'none',
                  },
                }}
              >
                Login
              </Button>
            )}
          </>
        )}

      </Stack>
    </Box>
  );
}
