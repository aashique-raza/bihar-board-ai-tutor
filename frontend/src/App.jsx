import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import { useTheme } from './hooks/useTheme.js';
import ChatPage from './pages/ChatPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import GuestOnlyRoute from './components/GuestOnlyRoute.jsx';

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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-page)',
        gap: '12px',
      }}>
        <div className="zuno-logo" style={{ width: 48, height: 48, fontSize: '1.5rem' }}>Z</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</div>
      </div>
    );
  }

  // Once loading is done, render the correct page based on the URL
  return (
    <Routes>
      {/* Main chat page — accessible to everyone (guest + logged in) */}
      <Route path="/" element={<ChatPage theme={theme} toggleTheme={toggleTheme} />} />

      {/* Auth pages */}
      <Route path="/login" element={<GuestOnlyRoute><LoginPage theme={theme} toggleTheme={toggleTheme} /></GuestOnlyRoute>} />
      <Route path="/register" element={<GuestOnlyRoute><RegisterPage theme={theme} toggleTheme={toggleTheme} /></GuestOnlyRoute>} />

      {/* Google OAuth callback — backend redirects here after OAuth */}
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Email verification and password reset flows */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Catch-all — unknown URLs go to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
