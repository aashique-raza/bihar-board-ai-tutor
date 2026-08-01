import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { useNavigate } from 'react-router-dom';
import { useLogout } from '../hooks/useLogout.js';

// Mobile-only account sheet — mirrors HistoryPanel's bottom-sheet pattern
// (drag handle, rounded top corners) for visual consistency.
export default function AccountSheet({ isOpen, onClose, user }) {
  const navigate = useNavigate();
  const logout = useLogout();

  const handleSupport = () => {
    onClose();
    navigate('/support');
  };

  const handleLogout = () => {
    onClose();
    logout();
  };

  return (
    <Drawer
      anchor="bottom"
      open={isOpen}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
          bgcolor: 'var(--bg-surface)',
        },
      }}
    >
      {/* Drag handle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
        <Box sx={{ width: 32, height: 3, bgcolor: 'var(--border-strong)', borderRadius: '99px' }} />
      </Box>

      {/* Profile header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.75, borderBottom: '1px solid var(--border)' }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 'var(--radius-avatar)',
            bgcolor: 'var(--primary)',
            color: 'var(--bg-page)',
            fontFamily: 'var(--font-brand)',
            fontSize: '0.95rem',
            fontWeight: 800,
          }}
        >
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }} noWrap>
            {user?.name}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }} noWrap>
            {user?.email}
          </Typography>
        </Box>
      </Box>

      {/* Menu items */}
      <Box sx={{ pb: 1 }}>
        <Box
          onClick={handleSupport}
          sx={{
            px: 2,
            py: 1.5,
            fontSize: '0.875rem',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            '&:hover': { bgcolor: 'var(--bg-hover)' },
          }}
        >
          <HelpOutlineRounded sx={{ fontSize: 20 }} />
          Support
        </Box>
        <Box
          onClick={handleLogout}
          sx={{
            px: 2,
            py: 1.5,
            fontSize: '0.875rem',
            color: 'var(--error)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            '&:hover': { bgcolor: 'var(--bg-hover)' },
          }}
        >
          <LogoutRounded sx={{ fontSize: 20 }} />
          Logout
        </Box>
      </Box>
    </Drawer>
  );
}
