import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.jsx';
import AppInitializer from './components/AppInitializer.jsx';
import { store, persistor } from './store/store.js';
import { injectStore } from './services/axios/axiosInstance.js';
import './styles/global.css';
import zunoTheme from './theme/zunoTheme.js';

// Wire the store into axiosInstance before any components mount.
// Must happen here — axiosInstance cannot import store directly (circular dep).
injectStore(store);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <ThemeProvider theme={zunoTheme}>
            <CssBaseline />
            <AppInitializer />
            <App />
          </ThemeProvider>
        </PersistGate>
      </Provider>
    </GoogleOAuthProvider>
  </StrictMode>
);
