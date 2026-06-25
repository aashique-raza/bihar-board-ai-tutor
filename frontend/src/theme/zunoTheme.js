import { createTheme } from '@mui/material/styles';

const zunoTheme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: {
        primary:    { main: '#C6570F', contrastText: '#FFFFFF' },
        background: { default: '#FAFAF8', paper: '#FFFFFF' },
        text:       { primary: '#1A1208', secondary: '#5C4A36' },
        success:    { main: '#10B981' },
        error:      { main: '#EF4444' },
        warning:    { main: '#F59E0B' },
        divider:    '#EAE6DE',
      },
    },
    dark: {
      palette: {
        primary:    { main: '#F0A500', contrastText: '#0A0A0A' },
        background: { default: '#0A0A0A', paper: '#141414' },
        text:       { primary: '#F4F4F4', secondary: '#C8C8C8' },
        success:    { main: '#34D399' },
        error:      { main: '#F87171' },
        warning:    { main: '#FBBF24' },
        divider:    '#282828',
      },
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: 0,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: 'var(--bg-page)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 'var(--radius-md)' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
});

export default zunoTheme;
