import { createTheme } from '@mui/material/styles';

const zunoTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#070910',
      paper: '#101826',
    },
    primary: {
      main: '#f3b63f',
      contrastText: '#08111f',
    },
    secondary: {
      main: '#5ab7ff',
    },
    success: {
      main: '#37d6a6',
    },
    text: {
      primary: '#f4f7fb',
      secondary: '#9aa8bb',
    },
    divider: 'rgba(151, 175, 215, 0.14)',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      letterSpacing: 0,
      fontWeight: 850,
    },
    h2: {
      letterSpacing: 0,
      fontWeight: 850,
    },
    button: {
      letterSpacing: 0,
      fontWeight: 800,
      textTransform: 'none',
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

export default zunoTheme;
