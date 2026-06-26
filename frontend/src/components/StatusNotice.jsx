import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';

function getFriendlyError(errorMsg) {
  if (!errorMsg) return '';
  const lowerError = errorMsg.toLowerCase();
  
  if (lowerError.includes('failed to fetch') || lowerError.includes('network') || lowerError.includes('internet')) {
    return 'Lagta hai internet thoda weak hai. Ek baar check karke wapas aao!';
  }
  if (lowerError.includes('timeout')) {
    return 'Zuno ko sochna me thoda zyada time lag gaya. Ek baar dobara pucho?';
  }
  if (lowerError.includes('session load nahi hui')) {
    return 'Oops! Ye chat load nahi ho paayi. Koi aur chat try karein?';
  }
  if (lowerError.includes('focus mode ke liye') || lowerError.includes('cancel kar di') || lowerError.includes('sawaal poochho')) {
    return errorMsg; // Already Hinglish/friendly
  }
  
  return 'Kuch technical dikkat aayi. Hum thodi der me theek kar lenge, aap padhai jaari rakhein!';
}

function StatusNotice({ error }) {
  if (!error) {
    return null;
  }

  const friendlyMessage = getFriendlyError(error);

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pb: 1.5 }}>
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'flex-start', 
          gap: 1.5,
          bgcolor: 'rgba(198, 87, 15, 0.08)', // Using accent color tint instead of harsh red
          border: '1px solid rgba(198, 87, 15, 0.2)',
          borderRadius: 3,
          p: 2
        }}
      >
        <ErrorOutlineRounded sx={{ color: 'var(--primary-accent, #C6570F)', mt: 0.25 }} />
        <Box>
          <Typography variant="body2" sx={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            {friendlyMessage}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default StatusNotice;
