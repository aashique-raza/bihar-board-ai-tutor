import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddCommentOutlined from '@mui/icons-material/AddCommentOutlined';
import CloseRounded from '@mui/icons-material/CloseRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import React, { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { clearCredentials } from '../store/slices/authSlice.js';
import { logoutUser } from '../services/axios/authService.js';
import { clearSessionId } from '../utils/session.js';


export default function Topbar({
  theme,
  onToggleTheme,
  selectedChapter,
  isFocusLoading,
  onOpenFocus,
  onClearFocus,
  onNewChat,
  onOpenHistory,
  isSessionLocked,
  focusTopics,
  currentTopicId,
  completedTopicIds,
  engagementCount = 0,
  chapterStatus,
}) {
  const { user, isLoggedIn, isLoading } = useAuth();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Focus mode progress — collapsed into the chapter pill (was a separate
  // FocusProgressHeader bar). Only meaningful once topics have loaded.
  const totalTopics = focusTopics?.length || 0;
  let currentTopicIndex = totalTopics > 0 ? focusTopics.findIndex((t) => t.topicId === currentTopicId) : -1;
  if (currentTopicIndex === -1 && totalTopics > 0) {
    currentTopicIndex = chapterStatus === 'completed' ? totalTopics : 0;
  }
  const displayTopicIndex = totalTopics > 0 ? Math.min(currentTopicIndex + 1, totalTopics) : 0;
  const progressPercent = totalTopics > 0
    ? Math.max(0, Math.min(100, ((completedTopicIds?.length || 0) / totalTopics) * 100))
    : 0;

  const progressTooltip = totalTopics > 0 ? (
    <Box sx={{ p: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: '#fff' }}>
        Topic {displayTopicIndex} / {totalTopics}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {/* TODO: Add topic-level Hinglish titles once chapter/section coverage is verified in production */}
        {focusTopics.map((t, i) => {
          const isDone = completedTopicIds?.includes(t.topicId);
          const isCurrent = t.topicId === currentTopicId;
          let icon = '🔒';
          if (isDone) icon = '✅';
          else if (isCurrent) icon = '🟢';
          else if (i === currentTopicIndex && !isCurrent) icon = '🟢';
          return (
            <Typography key={t.topicId} variant="caption" sx={{ color: isCurrent ? '#fff' : 'rgba(255,255,255,0.7)' }}>
              {icon} {t.title}
            </Typography>
          );
        })}
      </Box>
      {engagementCount > 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'rgba(255,255,255,0.75)' }}>
          💬 {engagementCount} sawaal poochhe is chapter me
        </Typography>
      )}
    </Box>
  ) : '';

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
        position: 'relative',
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
      {/* Left: hamburger (mobile only — desktop uses the persistent Sidebar) + Logo + wordmark */}
      <Stack direction="row" spacing={1} alignItems="center">
        <IconButton
          aria-label="Chat history"
          size="small"
          onClick={onOpenHistory}
          sx={{
            display: { xs: 'inline-flex', sm: 'none' },
            color: 'var(--text-muted)',
            '&:hover': { color: 'var(--text-primary)' },
          }}
        >
          <MenuRounded sx={{ fontSize: 20 }} />
        </IconButton>
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
              display: { xs: 'none', sm: 'block' },
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

        {/* Chapter pill — shown when focus is set, hidden on mobile. Hover shows the
            topic roadmap (was a separate FocusProgressHeader bar under the topbar). */}
        {selectedChapter && (
          <Tooltip title={progressTooltip} placement="bottom-end" arrow disableHoverListener={totalTopics === 0}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{
              display: 'inline-flex',
              maxWidth: { xs: 150, sm: 260 },
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
                maxWidth: { xs: 70, sm: 160 },
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.3,
              }}
            >
              {selectedChapter.hinglishTitle || selectedChapter.title}
            </Typography>
            {totalTopics > 0 && (
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>
                {Math.round(progressPercent)}%
              </Typography>
            )}
            <IconButton
              aria-label="Clear focus"
              size="small"
              onClick={onClearFocus}
              sx={{ padding: '2px', color: 'var(--primary-label)' }}
            >
              <CloseRounded sx={{ fontSize: '14px' }} />
            </IconButton>
          </Stack>
          </Tooltip>
        )}

        {/* Focus button — desktop: text+icon, mobile: icon only */}
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
            display: { xs: 'none', sm: 'inline-flex' },
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

        {/* Focus button — mobile icon only */}
        <IconButton
          size="small"
          disabled={isFocusLoading || isSessionLocked}
          onClick={onOpenFocus}
          title="Focus Mode"
          sx={{
            display: { xs: 'inline-flex', sm: 'none' },
            bgcolor: 'var(--primary-tint)',
            border: '1px solid var(--primary-border)',
            color: 'var(--primary-label)',
            borderRadius: 'var(--radius-full)',
            p: '5px',
            '&:hover': {
              bgcolor: 'var(--primary-tint)',
              borderColor: 'var(--primary)',
            },
            '&.Mui-disabled': {
              bgcolor: 'var(--primary-tint)',
              borderColor: 'var(--primary-border)',
              color: 'var(--primary-label)',
              opacity: 0.5,
            },
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="4"/>
            <line x1="12" y1="2" x2="12" y2="6"/>
            <line x1="12" y1="18" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="6" y2="12"/>
            <line x1="18" y1="12" x2="22" y2="12"/>
          </svg>
        </IconButton>

        {/* New Chat — mobile only (desktop uses the persistent Sidebar's "Naya chat" button) */}
        <IconButton
          aria-label="New chat"
          size="small"
          onClick={onNewChat}
          title="New Chat"
          sx={{
            display: { xs: 'inline-flex', sm: 'none' },
            color: isSessionLocked ? 'var(--primary)' : 'var(--text-muted)',
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
                  role="button"
                  tabIndex={0}
                  aria-label="User menu"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setMenuOpen((prev) => !prev);
                    }
                  }}
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
                      onClick={() => { setMenuOpen(false); navigate('/support'); }}
                      sx={{
                        px: 2,
                        py: 1.25,
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        borderBottom: '1px solid var(--border)',
                        '&:hover': { bgcolor: 'var(--bg-hover)' },
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <HelpOutlineRounded sx={{ fontSize: 18 }} />
                      Support
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

      {/* Thin focus-progress line — replaces the old separate FocusProgressHeader bar */}
      {selectedChapter && totalTopics > 0 && (
        <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '2px', bgcolor: 'var(--border)', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', width: `${progressPercent}%`, bgcolor: 'var(--primary)', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        </Box>
      )}
    </Box>
  );
}
