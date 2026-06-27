import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import { useTheme } from './hooks/useTheme.js';
import GuestOnlyRoute from './components/GuestOnlyRoute.jsx';

// Lazy loaded pages for code splitting
const ChatPage = lazy(() => import('./pages/ChatPage.jsx'));
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const AuthCallback = lazy(() => import('./pages/AuthCallback.jsx'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));

function App() {
  // Theme state lives here so all pages (Chat, Login, Register) share it
  const { theme, toggleTheme } = useTheme();

  // isLoading is true while AppInitializer is doing the silent refresh on startup
  const { isLoading } = useAuth();

  const LoadingFallback = (
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

  // Show blank screen while session is being restored — prevents flash of wrong page
  if (isLoading) {
    return LoadingFallback;
  }

  // Once loading is done, render the correct page based on the URL
  return (
    <Suspense fallback={LoadingFallback}>
      <Routes>
        {/* Landing page — public home, redirects logged-in users to /chat */}
        <Route path="/" element={<LandingPage />} />

        {/* Main chat page — accessible to everyone (guest + logged in) */}
        <Route path="/chat" element={<ChatPage theme={theme} toggleTheme={toggleTheme} />} />

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
    </Suspense>
  );
}

export default App;
