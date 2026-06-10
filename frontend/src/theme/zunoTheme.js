import { createTheme } from '@mui/material/styles';

/**
 * zunoTheme.js
 * MUI theme wired to Zuno CSS design tokens.
 * Colors come from CSS variables — do not hardcode hex values here.
 * Dark/light switching is handled by [data-theme] on <html> via useTheme hook.
 */
const zunoTheme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: {
        primary:    { main: '#4F46E5', contrastText: '#FFFFFF' },
        background: { default: '#F0F2F5', paper: '#FFFFFF' },
        text:       { primary: '#111827', secondary: '#374151' },
        success:    { main: '#10B981' },
        error:      { main: '#EF4444' },
        warning:    { main: '#F59E0B' },
        divider:    '#E4E7EC',
      },
    },
    dark: {
      palette: {
        primary:    { main: '#6366F1', contrastText: '#FFFFFF' },
        background: { default: '#111827', paper: '#1F2937' },
        text:       { primary: '#F9FAFB', secondary: '#D1D5DB' },
        success:    { main: '#34D399' },
        error:      { main: '#F87171' },
        warning:    { main: '#FBBF24' },
        divider:    '#374151',
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
