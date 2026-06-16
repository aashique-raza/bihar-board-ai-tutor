import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router-dom';

export default function GuestLoginPrompt() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <LockOutlined sx={{ fontSize: 32, color: 'var(--text-muted)', mb: 1 }} />
      <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 0.5 }}>
        Login karo to apni chats save ho jaayengi
      </Typography>
      <Typography variant="caption" sx={{ color: 'var(--text-muted)', display: 'block', mb: 2 }}>
        Guest chats abhi save nahi hoti — yeh feature jald aa raha hai!
      </Typography>
      <Button
        variant="contained"
        size="small"
        onClick={() => navigate('/login')}
        sx={{ textTransform: 'none', fontWeight: 600 }}
      >
        Login karo →
      </Button>
    </Box>
  );
}
