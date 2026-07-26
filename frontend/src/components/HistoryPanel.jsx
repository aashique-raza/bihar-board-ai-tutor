import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { SessionListBody } from './SessionList.jsx';
import { deleteSession as apiDeleteSession, renameSession as apiRenameSession } from '../api/tutorApi.js';

// Mobile-only bottom sheet — desktop history now lives in the persistent Sidebar.
export default function HistoryPanel({
  isOpen,
  onClose,
  isLoggedIn,
  isAuthLoading,
  sessions,
  isLoading,
  activeSessionId,
  onSessionSelect,
  onNewChat,
  fetchOnce,
  onSessionDelete,
  onSessionRename,
}) {
  const [localSessions, setLocalSessions] = useState(sessions);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync local sessions with prop
  useEffect(() => { setLocalSessions(sessions); }, [sessions]);

  // Fetch session list when panel opens
  useEffect(() => {
    if (isOpen) fetchOnce();
  }, [isOpen, fetchOnce]);

  // Clear search when panel closes
  useEffect(() => {
    if (!isOpen) setSearchQuery('');
  }, [isOpen]);

  const handleClose = () => onClose();

  const handleSessionSelect = (session) => {
    onSessionSelect(session);
    handleClose();
  };

  const handleNewChat = () => {
    onNewChat();
    handleClose();
  };

  // Optimistic delete
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

  // Optimistic rename
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

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return localSessions;
    const q = searchQuery.toLowerCase();
    return localSessions.filter((s) =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.previewText || '').toLowerCase().includes(q)
    );
  }, [localSessions, searchQuery]);

  return (
    <Drawer
      anchor="bottom"
      open={isOpen}
      onClose={handleClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          bgcolor: 'var(--bg-surface)',
          maxHeight: '72vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Drag handle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
        <Box sx={{ width: 32, height: 3, bgcolor: 'var(--border-strong)', borderRadius: '99px' }} />
      </Box>

      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2, py: 1.25, borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
          Chats
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Tooltip title="New Chat" placement="top">
            <IconButton
              aria-label="New chat"
              onClick={handleNewChat}
              sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--primary)' } }}
            >
              <AddRounded sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <IconButton
            aria-label="Close history"
            size="small"
            onClick={handleClose}
            sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-primary)' } }}
          >
            <CloseRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </Box>

      {/* Search bar — shown only when logged in and sessions exist */}
      {isLoggedIn && (
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5, flexShrink: 0 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.5, py: 0.75,
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
                flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)',
                '& input::placeholder': { color: 'var(--text-muted)', opacity: 1 },
              }}
            />
            {searchQuery && (
              <Box
                component="button"
                onClick={() => setSearchQuery('')}
                sx={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1, p: 0,
                  '&:hover': { color: 'var(--text-primary)' },
                }}
                aria-label="Clear search"
              >
                ✕
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Scrollable session list */}
      <Box sx={{
        flex: 1, overflowY: 'auto',
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: 'var(--border-strong)', borderRadius: 4,
          '&:hover': { bgcolor: 'var(--text-muted)' },
        },
      }}>
        <SessionListBody
          isLoggedIn={isLoggedIn}
          isAuthLoading={isAuthLoading}
          sessions={filteredSessions}
          isLoading={isLoading}
          activeSessionId={activeSessionId}
          onSessionSelect={handleSessionSelect}
          onDelete={handleDelete}
          onRename={handleRename}
          searchQuery={searchQuery}
        />
      </Box>
    </Drawer>
  );
}
