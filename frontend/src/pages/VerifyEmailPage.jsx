import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import { verifyEmailToken } from '../services/axios/authService';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast, showToast, hideToast } = useToast();

  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setErrorMessage('Verification token not found.');
      setStatus('error');
      return;
    }
    verifyEmailToken(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo-row">
          <div className="zuno-logo">Z</div>
          <span className="auth-logo-text">Zuno</span>
        </div>

        {status === 'loading' && (
          <p className="auth-subtext">Verifying your email...</p>
        )}

        {status === 'success' && (
          <>
            <CheckCircleOutlineRounded sx={{ fontSize: 48, color: 'var(--primary)', mb: 1 }} />
            <h2 className="auth-heading">Email verified!</h2>
            <p className="auth-subtext">Your account is ready. You can now sign in.</p>
            <Button
              variant="contained"
              fullWidth
              onClick={() => navigate('/login')}
              sx={{
                mt: '20px',
                py: '10px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                '&:hover': { backgroundColor: 'var(--primary-hover)', boxShadow: 'none' },
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'none',
              }}
            >
              Sign In
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <ErrorOutlineRounded sx={{ fontSize: 48, color: 'var(--error)', mb: 1 }} />
            <h2 className="auth-heading">Verification failed</h2>
            <span className="auth-subtext">{errorMessage}</span>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => navigate('/register')}
              sx={{
                mt: '20px',
                py: '10px',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
                '&:hover': {
                  borderColor: 'var(--border-strong)',
                  backgroundColor: 'var(--bg-hover)',
                  boxShadow: 'none',
                },
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.9rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'none',
              }}
            >
              Register again
            </Button>
          </>
        )}
      </div>
      <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
    </div>
  );
}

export default VerifyEmailPage;
