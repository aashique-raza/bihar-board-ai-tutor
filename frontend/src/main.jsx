import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import App from './App.jsx';
import './styles/global.css';
import zunoTheme from './theme/zunoTheme.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={zunoTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
