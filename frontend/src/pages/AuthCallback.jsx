import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setCredentials, setError } from '../store/slices/authSlice.js';
import { getMe } from '../services/axios/authService.js';

// Friendly messages for known Google OAuth error codes
const ERROR_MESSAGES = {
  account_exists: 'Yeh email already registered hai. Please login karo.',
  google_failed: 'Google sign-in fail hua. Please dobara try karo.',
};

// Handles the redirect back from Google OAuth.
// Backend sends: /auth/callback?token=<accessToken>
// Error case:    /auth/callback?error=account_exists | google_failed
// react-router-dom is not installed — using window.location.href for navigation.
function AuthCallback() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [statusText, setStatusText] = useState('Logging you in...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const tokenParam = params.get('token');

    const handleCallback = async () => {
      if (errorParam) {
        const message =
          ERROR_MESSAGES[errorParam] || 'Login fail hua. Please dobara try karo.';
        dispatch(setError(message));
        navigate('/login', { state: { toastError: message } });
        return;
      }

      if (tokenParam) {
        try {
          const user = await getMe(tokenParam);
          dispatch(setCredentials({ user, accessToken: tokenParam }));
          window.history.replaceState({}, '', '/auth/callback');
          navigate('/', { state: { toastSuccess: 'Google se login successful!' } });
        } catch {
          setStatusText('Login mein error aaya. Please dobara try karo.');
          setTimeout(() => { navigate('/login', { state: { toastError: 'Login mein error aaya. Please dobara try karo.' } }); }, 2000);
        }
        return;
      }

      // Neither token nor error — unexpected state, send to login
      navigate('/login');
    };

    handleCallback();
  }, [dispatch, navigate]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p style={{ fontFamily: 'sans-serif', color: '#ccc' }}>{statusText}</p>
    </div>
  );
}

export default AuthCallback;
