import React from 'react';
import AccountCircleRounded from '@mui/icons-material/AccountCircleRounded';
import HelpRounded from '@mui/icons-material/HelpRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import InsightsRounded from '@mui/icons-material/InsightsRounded';
import QuizRounded from '@mui/icons-material/QuizRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const navItems = [
  { label: 'Tutor', status: 'Live', icon: HelpRounded, active: true },
  { label: 'History', status: 'Soon', icon: HistoryRounded },
  { label: 'Tracking', status: 'Soon', icon: InsightsRounded },
  { label: 'Quiz', status: 'Soon', icon: QuizRounded },
];

function Sidebar() {
  return (
    <Box className="sidebar" component="aside" aria-label="Zuno navigation">
      <Stack spacing={3} sx={{ minHeight: '100%' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box className="zuno-logo">Z</Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1 }}>
              Zuno
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Class 10 Tutor
            </Typography>
          </Box>
        </Stack>

        <Stack spacing={1}>
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Button
                className={item.active ? 'nav-active' : ''}
                disabled={!item.active}
                fullWidth
                key={item.label}
                startIcon={<Icon />}
                sx={{ justifyContent: 'flex-start', minHeight: 48, px: 1.5 }}
                type="button"
              >
                <Box sx={{ flex: 1, textAlign: 'left' }}>{item.label}</Box>
                <Chip
                  color={item.active ? 'primary' : 'default'}
                  label={item.status}
                  size="small"
                  sx={{ height: 22, fontSize: 10, fontWeight: 900 }}
                />
              </Button>
            );
          })}
        </Stack>

        <Box sx={{ flex: 1 }} />

        <Button
          disabled
          fullWidth
          startIcon={<AccountCircleRounded />}
          sx={{ justifyContent: 'flex-start', minHeight: 48, px: 1.5 }}
          type="button"
        >
          <Box sx={{ flex: 1, textAlign: 'left' }}>Account</Box>
          <Chip label="Soon" size="small" sx={{ height: 22, fontSize: 10 }} />
        </Button>
      </Stack>
    </Box>
  );
}

export default Sidebar;
