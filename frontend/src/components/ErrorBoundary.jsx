import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error.message, info.componentStack);
  }

  // key prop change (e.g. sessionId change) causes React to remount this component,
  // which resets state.hasError to false automatically — no manual reset needed.
  render() {
    if (this.state.hasError) {
      return this.props.fallback || <DefaultFallback />;
    }
    return this.props.children;
  }
}

function DefaultFallback() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        gap: 2,
        px: 3,
        py: 6,
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}
    >
      <Typography variant="h6" sx={{ color: 'var(--text-primary)' }}>
        Kuch technical problem aayi
      </Typography>
      <Typography variant="body2">
        Page reload karo ya sidebar se nayi chat shuru karo.
      </Typography>
      <Button
        variant="outlined"
        size="small"
        onClick={() => window.location.reload()}
        sx={{ mt: 1 }}
      >
        Page Reload Karo
      </Button>
    </Box>
  );
}

export default ErrorBoundary;
