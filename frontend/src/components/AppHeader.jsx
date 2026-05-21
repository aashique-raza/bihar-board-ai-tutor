import React from 'react';
import TravelExploreRounded from '@mui/icons-material/TravelExploreRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

function AppHeader({
  activeMode,
  isFocusLoading,
  selectedChapter,
  onClearFocus,
  onOpenFocus,
}) {
  const isFocusMode = activeMode === 'focus';

  return (
    <Box className="app-header" component="header">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Box className="zuno-logo">Z</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 950, lineHeight: 1 }}>
            Zuno
          </Typography>
          <Typography color="text.secondary" sx={{ fontWeight: 650 }} noWrap>
            Class 10 ka personal study mentor.
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
        {isFocusMode && selectedChapter && (
          <Box className="focus-chip">
            <Chip
              icon={<TravelExploreRounded />}
              label="Focus Mode"
              size="small"
              sx={{ fontWeight: 900, height: 26 }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography className="focus-chip-section" variant="caption">
                {selectedChapter.subjectTitle} / {selectedChapter.sectionTitle}
              </Typography>
              <Typography className="focus-chip-title" noWrap>
                {selectedChapter.title}
              </Typography>
            </Box>
            <Button color="inherit" onClick={onClearFocus} size="small" type="button">
              Clear
            </Button>
          </Box>
        )}

        <Button
          color="primary"
          disabled={isFocusLoading}
          size="large"
          type="button"
          variant="contained"
          onClick={onOpenFocus}
        >
          Focus
        </Button>
      </Stack>
    </Box>
  );
}

export default AppHeader;
