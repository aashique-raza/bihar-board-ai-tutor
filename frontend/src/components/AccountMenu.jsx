import { useState } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { useNavigate } from 'react-router-dom';
import { useLogout } from '../hooks/useLogout.js';

// Desktop-only — lives in the Sidebar footer. `compact` renders the
// collapsed-rail variant (avatar only, menu pops to the right); the
// expanded variant renders a full row with the menu opening upward.
export default function AccountMenu({ user, compact = false }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const logout = useLogout();
  const open = Boolean(anchorEl);

  const handleSupport = () => {
    setAnchorEl(null);
    navigate('/support');
  };

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
  };

  const avatar = (
    <Box
      sx={{
        width: compact ? 32 : 26,
        height: compact ? 32 : 26,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 'var(--radius-avatar)',
        bgcolor: 'var(--primary)',
        color: 'var(--bg-page)',
        fontFamily: 'var(--font-brand)',
        fontSize: compact ? '0.85rem' : '0.75rem',
        fontWeight: 800,
      }}
    >
      {user?.name?.charAt(0)?.toUpperCase() || '?'}
    </Box>
  );

  const menu = (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={() => setAnchorEl(null)}
      anchorOrigin={compact ? { vertical: 'top', horizontal: 'right' } : { vertical: 'top', horizontal: 'left' }}
      transformOrigin={compact ? { vertical: 'top', horizontal: 'left' } : { vertical: 'bottom', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            minWidth: 200,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
          },
        },
      }}
    >
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }} noWrap>
          {user?.name}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4, mt: 0.25 }} noWrap>
          {user?.email}
        </Typography>
      </Box>
      <Divider sx={{ borderColor: 'var(--border)' }} />
      <MenuItem onClick={handleSupport} sx={{ fontSize: '0.875rem', py: 1.25, px: 2, color: 'var(--text-primary)' }}>
        <ListItemIcon sx={{ minWidth: 32 }}>
          <HelpOutlineRounded sx={{ fontSize: 18, color: 'var(--text-muted)' }} />
        </ListItemIcon>
        Support
      </MenuItem>
      <Divider sx={{ borderColor: 'var(--border)' }} />
      <MenuItem onClick={handleLogout} sx={{ fontSize: '0.875rem', py: 1.25, px: 2, color: 'var(--error)' }}>
        <ListItemIcon sx={{ minWidth: 32 }}>
          <LogoutRounded sx={{ fontSize: 18, color: 'var(--error)' }} />
        </ListItemIcon>
        Logout
      </MenuItem>
    </Menu>
  );

  if (compact) {
    return (
      <>
        <Tooltip title={user?.name || 'Account'} placement="right">
          <Box
            role="button"
            tabIndex={0}
            aria-label="User menu"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setAnchorEl(e.currentTarget);
              }
            }}
            sx={{ cursor: 'pointer', display: 'inline-flex', transition: 'opacity 0.15s ease', '&:hover': { opacity: 0.85 } }}
          >
            {avatar}
          </Box>
        </Tooltip>
        {menu}
      </>
    );
  }

  return (
    <>
      <Box
        role="button"
        tabIndex={0}
        aria-label="User menu"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setAnchorEl(e.currentTarget);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 1,
          borderTop: '1px solid var(--border)',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'var(--bg-hover)' },
        }}
      >
        {avatar}
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }} noWrap>
          {user?.name}
        </Typography>
        {open ? (
          <ExpandLessRounded sx={{ fontSize: 18, color: 'var(--text-muted)', flexShrink: 0 }} />
        ) : (
          <ExpandMoreRounded sx={{ fontSize: 18, color: 'var(--text-muted)', flexShrink: 0 }} />
        )}
      </Box>
      {menu}
    </>
  );
}
