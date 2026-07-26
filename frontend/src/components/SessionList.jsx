import React, { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileRenameOutlineRounded from '@mui/icons-material/DriveFileRenameOutlineRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import GuestLoginPrompt from './GuestLoginPrompt.jsx';

// --- Date grouping — shared between desktop Sidebar and mobile HistoryPanel ---

export const groupByDate = (sessions) => {
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

export const formatTime = (dateStr) => {
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

export function SessionRow({ session, isActive, onSelect, onDelete, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  const displayTitle = session.previewText && session.title === 'New Chat'
    ? session.previewText
    : session.title;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(session.title === 'New Chat' ? '' : session.title);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isRenaming, session.title]);

  const handleMenuToggle = (e) => { e.stopPropagation(); setMenuOpen((prev) => !prev); };
  const handleRenameStart = (e) => { e.stopPropagation(); setMenuOpen(false); setIsRenaming(true); };

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

  const handleDelete = (e) => { e.stopPropagation(); setMenuOpen(false); onDelete(session.sessionId); };

  return (
    <Box
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => !isRenaming && onSelect(session)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!isRenaming && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(session);
        }
      }}
      aria-label={`Select session: ${displayTitle}`}
      sx={{
        px: 1.5, py: 1,
        cursor: isRenaming ? 'default' : 'pointer',
        borderRadius: 'var(--radius-md)',
        bgcolor: isActive ? 'var(--primary-tint)' : 'transparent',
        border: isActive ? '1px solid var(--primary-border)' : '1px solid transparent',
        display: 'flex', alignItems: 'center', gap: 0.5,
        position: 'relative',
        '&:active': { transform: isRenaming ? 'none' : 'scale(0.97)' },
        '@media (hover: hover)': {
          '&:hover': {
            bgcolor: isActive ? 'var(--primary-tint)' : 'var(--bg-hover)',
            transform: isRenaming ? 'none' : 'translateY(-1px)',
            boxShadow: isRenaming ? 'none' : 'var(--shadow-sm)'
          }
        },
        transition: 'all 0.15s ease',
        minHeight: 44,
      }}
    >
      {session.isLocked && (
        <LockOutlined sx={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }} />
      )}

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
              fontSize: '0.82rem', color: 'var(--text-primary)', width: '100%',
              '& input': { p: 0, border: 'none', outline: 'none', bgcolor: 'transparent' },
            }}
          />
        ) : (
          <>
            <Typography
              variant="body2"
              sx={{
                color: isActive ? 'var(--primary-label)' : 'var(--text-primary)',
                fontWeight: isActive ? 600 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontSize: '0.82rem', lineHeight: 1.4,
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

      {!isRenaming && (isHovered || menuOpen) && (
        <Box ref={menuRef} sx={{ position: 'relative', flexShrink: 0 }}>
          <Tooltip title="Options" placement="top">
            <IconButton
              aria-label="Session options"
              size="small"
              onClick={handleMenuToggle}
              sx={{
                color: 'var(--text-muted)', p: '3px',
                '&:hover': { color: 'var(--text-primary)', bgcolor: 'var(--bg-hover)' },
              }}
            >
              <MoreVertRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>

          {menuOpen && (
            <Box sx={{
              position: 'absolute', top: '100%', right: 0, mt: 0.5,
              minWidth: 130, bgcolor: 'var(--bg-surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)', zIndex: 1400, overflow: 'hidden',
            }}>
              <Box
                onClick={handleRenameStart}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 1.5, py: 1, fontSize: '0.8rem', color: 'var(--text-primary)',
                  cursor: 'pointer', '&:hover': { bgcolor: 'var(--bg-hover)' },
                }}
              >
                <DriveFileRenameOutlineRounded sx={{ fontSize: 15 }} />
                Rename
              </Box>
              <Box
                onClick={handleDelete}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 1.5, py: 1, fontSize: '0.8rem', color: 'var(--error)',
                  cursor: 'pointer', '&:hover': { bgcolor: 'var(--bg-hover)' },
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

// --- SessionListBody — grouped list with loading/empty/guest states ---
// Shared between the desktop Sidebar (expanded) and the mobile HistoryPanel drawer.

export function SessionListBody({ isLoggedIn, isAuthLoading, sessions, isLoading, activeSessionId, onSessionSelect, onDelete, onRename, searchQuery }) {
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

  if (sessions.length === 0 && searchQuery) {
    return (
      <Box sx={{ px: 2, pt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <Box
          sx={{
            width: 56, height: 56, borderRadius: '50%',
            bgcolor: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2
          }}
        >
          <SearchOffRounded sx={{ fontSize: 28, color: 'var(--text-muted)' }} />
        </Box>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontWeight: 500, mb: 0.5 }}>
          "{searchQuery}"
        </Typography>
        <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
          Is naam se koi chat nahi mili.<br/>Kuch aur type karke dekhein?
        </Typography>
      </Box>
    );
  }

  if (sessions.length === 0) {
    return (
      <Box sx={{ px: 2, pt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <Box
          sx={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(198,87,15,0.1) 0%, rgba(240,165,0,0.1) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2
          }}
        >
          <MenuBookRounded sx={{ fontSize: 32, color: 'var(--primary-accent, #C6570F)' }} />
        </Box>
        <Typography variant="body2" sx={{ color: 'var(--text-primary)', fontWeight: 600, mb: 0.5 }}>
          Zuno aapka intezaar kar raha hai!
        </Typography>
        <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
          Naya chat shuru karein aur apne <br/> doubts clear karein.
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
            <Typography
              variant="caption"
              sx={{
                px: 1.5, pt: 1.5, pb: 0.5, display: 'block',
                color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.68rem',
                textTransform: 'uppercase', letterSpacing: '0.08em',
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
