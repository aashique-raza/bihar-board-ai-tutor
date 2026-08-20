import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import QuizRounded from '@mui/icons-material/QuizRounded';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useSidebarCollapsed } from '../hooks/useSidebarCollapsed.js';
import { SessionListBody } from './SessionList.jsx';
import AccountMenu from './AccountMenu.jsx';
import ZunoMark from './ZunoMark.jsx';
import { deleteSession as apiDeleteSession, renameSession as apiRenameSession } from '../api/tutorApi.js';

const RAIL_WIDTH = 56;
const EXPANDED_WIDTH = 220;

export default function Sidebar({
  isLoggedIn,
  isAuthLoading,
  sessions,
  isSessionsLoading,
  fetchOnce,
  activeSessionId,
  onSessionSelect,
  onNewChat,
  onSessionDelete,
  onSessionRename,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [localSessions, setLocalSessions] = useState(sessions);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { setLocalSessions(sessions); }, [sessions]);

  // Sidebar is always mounted on desktop — fetch the session list on mount
  // instead of waiting for a panel-open event (there is no open/close here).
  useEffect(() => { fetchOnce(); }, [fetchOnce]);

  const handleDelete = useCallback(async (sessionId) => {
    const prev = localSessions;
    setLocalSessions((s) => s.filter((x) => x.sessionId !== sessionId));
    try {
      await apiDeleteSession(sessionId);
      onSessionDelete?.(sessionId);
    } catch {
      setLocalSessions(prev);
    }
  }, [localSessions, onSessionDelete]);

  const handleRename = useCallback(async (sessionId, title) => {
    setLocalSessions((s) =>
      s.map((x) => x.sessionId === sessionId ? { ...x, title, previewText: null } : x)
    );
    try {
      await apiRenameSession(sessionId, title);
      onSessionRename?.(sessionId, title);
    } catch {
      // Silent fail — parent refresh will correct it
    }
  }, [onSessionRename]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return localSessions;
    const q = searchQuery.toLowerCase();
    return localSessions.filter((s) =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.previewText || '').toLowerCase().includes(q)
    );
  }, [localSessions, searchQuery]);

  // Recent sessions are already ordered by lastMessageAt desc (backend + refresh()
  // reorder on every response) — the rail just needs a short slice.
  const railSessions = localSessions.slice(0, 6);

  const containerSx = {
    display: { xs: 'none', sm: 'flex' },
    flexDirection: 'column',
    height: '100vh',
    flexShrink: 0,
    bgcolor: 'var(--bg-surface)',
    borderRight: '1px solid var(--border)',
    width: collapsed ? RAIL_WIDTH : EXPANDED_WIDTH,
    transition: 'width 0.2s ease',
    overflow: 'hidden',
  };

  if (collapsed) {
    return (
      <Box component="nav" aria-label="Chat history" sx={containerSx}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1.25, pb: 1, gap: 1 }}>
          <ZunoMark size={28} />
          <Tooltip title="Naya chat" placement="right">
            <IconButton
              aria-label="New chat"
              onClick={onNewChat}
              sx={{
                width: 32, height: 32,
                bgcolor: 'var(--primary-tint)',
                border: '1px solid var(--primary-border)',
                color: 'var(--primary-label)',
                borderRadius: 'var(--radius-md)',
                '&:hover': { bgcolor: 'var(--primary-tint)', borderColor: 'var(--primary)' },
              }}
            >
              <AddRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Practice Quiz" placement="right">
            <IconButton
              aria-label="Practice Quiz"
              onClick={() => navigate('/quiz')}
              sx={{
                width: 32, height: 32,
                color: 'var(--text-muted)',
                borderRadius: 'var(--radius-md)',
                '&:hover': { color: 'var(--text-primary)', bgcolor: 'var(--bg-hover)' },
              }}
            >
              <QuizRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {isLoggedIn && railSessions.length > 0 && (
          <>
            <Box sx={{ width: 26, height: '1px', bgcolor: 'var(--border)', mx: 'auto', my: 0.5 }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, py: 0.5, overflow: 'hidden' }}>
              {railSessions.map((session) => {
                const isActive = session.sessionId === activeSessionId;
                const displayTitle = session.previewText && session.title === 'New Chat'
                  ? session.previewText
                  : session.title;
                return (
                  <Tooltip key={session.sessionId} title={displayTitle} placement="right">
                    <IconButton
                      aria-label={`Select session: ${displayTitle}`}
                      onClick={() => onSessionSelect(session)}
                      sx={{
                        width: 32, height: 32,
                        borderRadius: 'var(--radius-md)',
                        bgcolor: isActive ? 'var(--primary-tint)' : 'transparent',
                        '&:hover': { bgcolor: isActive ? 'var(--primary-tint)' : 'var(--bg-hover)' },
                      }}
                    >
                      <Box sx={{
                        width: 7, height: 7, borderRadius: '50%',
                        bgcolor: isActive ? 'var(--primary)' : 'var(--text-muted)',
                      }} />
                    </IconButton>
                  </Tooltip>
                );
              })}
            </Box>
          </>
        )}

        <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, pb: 1.25, pt: 1 }}>
          {isLoggedIn && user && <AccountMenu user={user} compact />}
          <Tooltip title="Sidebar kholo" placement="right">
            <IconButton
              aria-label="Expand sidebar"
              onClick={() => setCollapsed(false)}
              size="small"
              sx={{
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                '&:hover': { bgcolor: 'var(--bg-hover)' },
              }}
            >
              <ChevronRightRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    );
  }

  return (
    <Box component="nav" aria-label="Chat history" sx={containerSx}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.25, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <ZunoMark size={24} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Zuno</Typography>
        <Tooltip title="Sidebar band karo" placement="right">
          <IconButton
            aria-label="Collapse sidebar"
            onClick={() => setCollapsed(true)}
            size="small"
            sx={{ ml: 'auto', color: 'var(--text-muted)', '&:hover': { color: 'var(--text-primary)', bgcolor: 'var(--bg-hover)' } }}
          >
            <ChevronLeftRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* New chat */}
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.5, flexShrink: 0 }}>
        <Box
          component="button"
          onClick={onNewChat}
          sx={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.25, py: 0.9,
            border: '1px solid var(--primary-border)',
            borderRadius: 'var(--radius-md)',
            bgcolor: 'var(--primary-tint)',
            color: 'var(--primary-label)',
            fontSize: '0.8rem', fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            '&:hover': { bgcolor: '#FDE9C0' },
          }}
        >
          <AddRounded sx={{ fontSize: 16 }} />
          Naya chat
        </Box>
      </Box>

      {/* Practice Quiz — standalone entry point, separate from chat sessions */}
      <Box sx={{ px: 1.5, pb: 0.5, flexShrink: 0 }}>
        <Box
          component="button"
          onClick={() => navigate('/quiz')}
          sx={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.25, py: 0.9,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            bgcolor: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem', fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'var(--bg-hover)', color: 'var(--text-primary)' },
          }}
        >
          <QuizRounded sx={{ fontSize: 16 }} />
          Practice Quiz
        </Box>
      </Box>

      {/* Search — only meaningful once there are sessions to search */}
      {isLoggedIn && (
        <Box sx={{ px: 1.5, pt: 0.75, pb: 0.5, flexShrink: 0 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.25, py: 0.65,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
            <InputBase
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search karo..."
              inputProps={{ 'aria-label': 'Search sessions' }}
              sx={{
                flex: 1, fontSize: '0.78rem', color: 'var(--text-primary)',
                '& input::placeholder': { color: 'var(--text-muted)', opacity: 1 },
              }}
            />
          </Box>
        </Box>
      )}

      {/* Session list */}
      <Box sx={{
        flex: 1, overflowY: 'auto',
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'var(--border-strong)', borderRadius: 4, '&:hover': { bgcolor: 'var(--text-muted)' } },
      }}>
        <SessionListBody
          isLoggedIn={isLoggedIn}
          isAuthLoading={isAuthLoading}
          sessions={filteredSessions}
          isLoading={isSessionsLoading}
          activeSessionId={activeSessionId}
          onSessionSelect={onSessionSelect}
          onDelete={handleDelete}
          onRename={handleRename}
          searchQuery={searchQuery}
        />
      </Box>

      {isLoggedIn && user && <AccountMenu user={user} />}
    </Box>
  );
}
