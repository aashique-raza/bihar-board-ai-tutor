import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';

function StatusNotice({ error }) {
  if (!error) {
    return null;
  }

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: 1.5 }}>
      <Alert severity="error" variant="outlined">
        {error}
      </Alert>
    </Box>
  );
}

export default StatusNotice;
