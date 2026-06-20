import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';

const CONTENT = {
  turn_limit: {
    headline: ['Login karo,', 'padhna jaari rakho'],
    body: '5 sawaal ho gaye. Free account mein koi limit nahi — poori chat history bhi save hogi.',
    showDots: true,
  },
  new_chat: {
    headline: ['Login karo,', 'naya topic shuru karo'],
    body: 'Guest mode mein history save nahi hoti. Login karo aur jo chaho padho — free hai.',
    showDots: false,
  },
};

function GuestLimitModal({ open, trigger = 'turn_limit', onLogin, onRegister, onClose }) {
  const { headline, body, showDots } = CONTENT[trigger] || CONTENT.turn_limit;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          bgcolor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          maxWidth: 340,
          width: '100%',
          mx: 2,
        },
      }}
    >
      <DialogContent sx={{ p: '24px', position: 'relative' }}>
        {/* X close button */}
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Close"
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            color: 'var(--text-muted)',
            p: '4px',
            '&:hover': { bgcolor: 'var(--bg-hover)' },
          }}
        >
          <CloseRounded sx={{ fontSize: 17 }} />
        </IconButton>

        {/* Progress dots — only for turn_limit */}
        {showDots && (
          <Box sx={{ display: 'flex', gap: '6px', mb: 2.25 }} aria-label="5 sawaal pooch liye">
            {[...Array(5)].map((_, i) => (
              <Box
                key={i}
                sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main' }}
              />
            ))}
          </Box>
        )}

        {/* Headline — pr to not overlap with X button */}
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 500,
            color: 'var(--text-primary)',
            lineHeight: 1.35,
            mb: 1,
            pr: 3,
          }}
        >
          {headline[0]}
          <br />
          {headline[1]}
        </Typography>

        {/* Body */}
        <Typography
          sx={{
            fontSize: 13,
            color: 'var(--text-muted)',
            lineHeight: 1.7,
            mb: 2.5,
          }}
        >
          {body}
        </Typography>

        {/* Stacked CTAs */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button
            variant="contained"
            fullWidth
            onClick={onLogin}
            endIcon={<ArrowForwardRounded sx={{ fontSize: 14 }} />}
            sx={{ py: 1.25, fontSize: 13, fontWeight: 500 }}
          >
            Login karo
          </Button>
          <Button
            variant="outlined"
            fullWidth
            onClick={onRegister}
            sx={{
              py: 1.25,
              fontSize: 13,
              borderColor: 'var(--border-strong)',
              color: 'var(--text-secondary)',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'transparent' },
            }}
          >
            Register karo — free hai
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default GuestLimitModal;
