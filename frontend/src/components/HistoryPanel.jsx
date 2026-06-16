import React, { useState, useRef, useEffect, useCallback } from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileRenameOutlineRounded from '@mui/icons-material/DriveFileRenameOutlineRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import { useTheme, useMediaQuery } from '@mui/material';
import GuestLoginPrompt from './GuestLoginPrompt.jsx';
import { deleteSession as apiDeleteSession, renameSession as apiRenameSession } from '../api/tutorApi.js';

// --- Date grouping ---

const groupByDate = (sessions) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
  for (const s of sessions) {
    const d = new Date(s.lastMessageAt);
    if (d >= today) groups['Today'].push(s);
    else if (d >= yesterday) groups['Yesterday'].push(s);
    else if (d >= weekAgo) groups['This Week'].push(s);
    else groups['Earlier'].push(s);
  }
  return groups;
};

// Today → relative time. Older → actual clock time (date context from group header).
const formatTime = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// --- SessionRow ---

function SessionRow({ session, isActive, onSelect, onDelete, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  const displayTitle = session.previewText && session.title === 'New Chat'
    ? session.previewText
    : session.title;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Focus input when rename starts
  useEffect(() => {
    if (isRenaming) {
      setRenameValue(session.title === 'New Chat' ? '' : session.title);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isRenaming, session.title]);

  const handleMenuToggle = (e) => {
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  };

  const handleRenameStart = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    setIsRenaming(true);
  };

  const handleRenameSave = async () => {
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === session.title) return;
    await onRename(session.sessionId, trimmed);
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleRenameSave(); }
    if (e.key === 'Escape') { setIsRenaming(false); }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete(session.sessionId);
  };

  return (
    <Box
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => !isRenaming && onSelect(session)}
      sx={{
        px: 1.5,
        py: 1,
        cursor: isRenaming ? 'default' : 'pointer',
        borderRadius: 'var(--radius-md)',
        bgcolor: isActive ? 'var(--primary-tint)' : 'transparent',
        border: isActive ? '1px solid var(--primary-border)' : '1px solid transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        position: 'relative',
        '&:hover': { bgcolor: isActive ? 'var(--primary-tint)' : 'var(--bg-hover)' },
        transition: 'background 0.12s ease',
        minHeight: 44,
      }}
    >
      {/* Lock icon */}
      {session.isLocked && (
        <LockOutlined sx={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }} />
      )}

      {/* Title / Rename input */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {isRenaming ? (
          <InputBase
            inputRef={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSave}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
            placeholder="Chat ka naam likho..."
            sx={{
              fontSize: '0.82rem',
              color: 'var(--text-primary)',
              width: '100%',
              '& input': {
                p: 0,
                border: 'none',
                outline: 'none',
                bgcolor: 'transparent',
              },
            }}
          />
        ) : (
          <>
            <Typography
              variant="body2"
              sx={{
                color: isActive ? 'var(--primary-label)' : 'var(--text-primary)',
                fontWeight: isActive ? 600 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '0.82rem',
                lineHeight: 1.4,
              }}
            >
              {displayTitle}
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              {formatTime(session.lastMessageAt)}
            </Typography>
          </>
        )}
      </Box>

      {/* Three-dot button — visible on hover or when menu is open */}
      {!isRenaming && (isHovered || menuOpen) && (
        <Box ref={menuRef} sx={{ position: 'relative', flexShrink: 0 }}>
          <Tooltip title="Options" placement="top">
            <IconButton
              size="small"
              onClick={handleMenuToggle}
              sx={{
                color: 'var(--text-muted)',
                p: '3px',
                '&:hover': { color: 'var(--text-primary)', bgcolor: 'var(--bg-hover)' },
              }}
            >
              <MoreVertRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          {/* Dropdown menu */}
          {menuOpen && (
            <Box
              sx={{
                position: 'absolute',
                top: '100%',
                right: 0,
                mt: 0.5,
                minWidth: 130,
                bgcolor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                zIndex: 1400,
                overflow: 'hidden',
              }}
            >
              <Box
                onClick={handleRenameStart}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'var(--bg-hover)' },
                }}
              >
                <DriveFileRenameOutlineRounded sx={{ fontSize: 15 }} />
                Rename
              </Box>
              <Box
                onClick={handleDelete}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  fontSize: '0.8rem',
                  color: 'var(--error)',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'var(--bg-hover)' },
                }}
              >
                <DeleteOutlineRounded sx={{ fontSize: 15 }} />
                Delete
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// --- Panel content ---

function PanelContent({
  isLoggedIn,
  isAuthLoading,
  sessions,
  isLoading,
  activeSessionId,
  onSessionSelect,
  onDelete,
  onRename,
}) {
  if (isAuthLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (!isLoggedIn) return <GuestLoginPrompt />;

  if (isLoading) {
    return (
      <Stack spacing={0.75} sx={{ px: 1.5, pt: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={44} sx={{ borderRadius: 'var(--radius-md)' }} />
        ))}
      </Stack>
    );
  }

  if (sessions.length === 0) {
    return (
      <Box sx={{ px: 2, pt: 4, textAlign: 'center' }}>
        <HistoryRounded sx={{ fontSize: 28, color: 'var(--text-muted)', mb: 1, opacity: 0.5 }} />
        <Typography variant="caption" sx={{ color: 'var(--text-muted)', display: 'block' }}>
          Koi purani chat nahi hai.
        </Typography>
        <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
          Pehla sawaal poochho!
        </Typography>
      </Box>
    );
  }

  const groups = groupByDate(sessions);
  const groupKeys = ['Today', 'Yesterday', 'This Week', 'Earlier'];

  return (
    <Stack spacing={0} sx={{ px: 1, pb: 2 }}>
      {groupKeys.map((label) => {
        const group = groups[label];
        if (!group || group.length === 0) return null;
        return (
          <Box key={label}>
            {/* Group header */}
            <Typography
              variant="caption"
              sx={{
                px: 1.5,
                pt: 1.5,
                pb: 0.5,
                display: 'block',
                color: 'var(--text-muted)',
                fontWeight: 700,
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {label}
            </Typography>
            {group.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                isActive={session.sessionId === activeSessionId}
                onSelect={onSessionSelect}
                onDelete={onDelete}
                onRename={onRename}
              />
            ))}
          </Box>
        );
      })}
    </Stack>
  );
}

// --- Main HistoryPanel ---

export default function HistoryPanel({
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
  const [isOpen, setIsOpen] = useState(false);
  const [localSessions, setLocalSessions] = useState(sessions);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const panelRef = useRef(null);
  const fabRef = useRef(null);

  // Keep localSessions in sync with prop (after refresh from parent)
  useEffect(() => { setLocalSessions(sessions); }, [sessions]);

  // Click-outside close for desktop panel
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handler = (e) => {
      const clickedPanel = panelRef.current?.contains(e.target);
      const clickedFab = fabRef.current?.contains(e.target);
      if (!clickedPanel && !clickedFab) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, isMobile]);

  const handleFabClick = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) fetchOnce();
      return !prev;
    });
  }, [fetchOnce]);

  const handleClose = () => setIsOpen(false);

  const handleSessionSelect = (session) => {
    onSessionSelect(session);
    handleClose();
  };

  const handleNewChat = () => {
    onNewChat();
    handleClose();
  };

  // Optimistic delete — remove locally, call API, restore on failure
  const handleDelete = useCallback(async (sessionId) => {
    const prev = localSessions;
    setLocalSessions((s) => s.filter((x) => x.sessionId !== sessionId));
    try {
      await apiDeleteSession(sessionId);
      onSessionDelete?.(sessionId);
    } catch {
      setLocalSessions(prev); // restore on failure
    }
  }, [localSessions, onSessionDelete]);

  // Optimistic rename — update locally, call API, sync on response
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

  const sessionCount = isLoggedIn ? localSessions.length : 0;

  const panelHeader = (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      px: 2,
      py: 1.25,
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
        Chats
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {/* New Chat shortcut in panel */}
        <Tooltip title="New Chat" placement="top">
          <IconButton
            size="small"
            onClick={handleNewChat}
            sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--primary)' } }}
          >
            <AddRounded sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{ color: 'var(--text-muted)', '&:hover': { color: 'var(--text-primary)' } }}
        >
          <CloseRounded sx={{ fontSize: 18 }} />
        </IconButton>
      </Stack>
    </Box>
  );

  const panelBody = (
    <Box sx={{
      flex: 1,
      overflowY: 'auto',
      // Thin custom scrollbar
      '&::-webkit-scrollbar': { width: 4 },
      '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
      '&::-webkit-scrollbar-thumb': {
        bgcolor: 'var(--border-strong)',
        borderRadius: 4,
        '&:hover': { bgcolor: 'var(--text-muted)' },
      },
    }}>
      <PanelContent
        isLoggedIn={isLoggedIn}
        isAuthLoading={isAuthLoading}
        sessions={localSessions}
        isLoading={isLoading}
        activeSessionId={activeSessionId}
        onSessionSelect={handleSessionSelect}
        onDelete={handleDelete}
        onRename={handleRename}
      />
    </Box>
  );

  return (
    <>
      {/* FAB with session count badge */}
      <Badge
        badgeContent={sessionCount}
        color="primary"
        max={99}
        sx={{ position: 'fixed', bottom: 128, right: 16, zIndex: 1200 }}
      >
        <Fab
          ref={fabRef}
          onClick={handleFabClick}
          size="medium"
          aria-label="Chat history"
          sx={{
            bgcolor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            boxShadow: 'var(--shadow-md)',
            '&:hover': { bgcolor: 'var(--bg-hover)', color: 'var(--text-primary)' },
          }}
        >
          <HistoryRounded />
        </Fab>
      </Badge>

      {/* Mobile — bottom sheet */}
      {isMobile ? (
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
          {panelHeader}
          {panelBody}
        </Drawer>
      ) : (
        /* Desktop — floating panel */
        isOpen && (
          <Box
            ref={panelRef}
            sx={{
              position: 'fixed',
              bottom: 188,
              right: 16,
              width: 300,
              maxHeight: '62vh',
              bgcolor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 1200,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {panelHeader}
            {panelBody}
          </Box>
        )
      )}
    </>
  );
}
