import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import { useTheme } from './hooks/useTheme.js';
import ChatPage from './pages/ChatPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AuthCallback from './pages/AuthCallback.jsx';

function App() {
  // Theme state lives here so all pages (Chat, Login, Register) share it
  const { theme, toggleTheme } = useTheme();

  // isLoading is true while AppInitializer is doing the silent refresh on startup
  const { isLoading } = useAuth();

  // Show blank screen while session is being restored — prevents flash of wrong page
  if (isLoading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-page)',
      }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Zuno load ho raha hai...
        </div>
      </div>
    );
  }

  // Once loading is done, render the correct page based on the URL
  return (
    <Routes>
      {/* Main chat page — accessible to everyone (guest + logged in) */}
      <Route path="/" element={<ChatPage theme={theme} toggleTheme={toggleTheme} />} />

      {/* Auth pages */}
      <Route path="/login" element={<LoginPage theme={theme} toggleTheme={toggleTheme} />} />
      <Route path="/register" element={<RegisterPage theme={theme} toggleTheme={toggleTheme} />} />

      {/* Google OAuth callback — backend redirects here after OAuth */}
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Catch-all — unknown URLs go to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
