import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import { forgotPasswordRequest } from '../services/axios/authService';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

const FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    '& fieldset': { borderColor: 'var(--border)' },
    '&:hover fieldset': { borderColor: 'var(--border-strong)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--primary)', borderWidth: '1.5px' },
    backgroundColor: 'var(--bg-input)',
  },
  '& .MuiInputLabel-root': { color: 'var(--text-muted)' },
  '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary)' },
  '& .MuiInputBase-input': { color: 'var(--text-primary)' },
};

function validateEmail(value) {
  if (!value.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address';
  return '';
}

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const isDisabled = !email.trim() || !!emailError || loading;

  function handleBlurEmail() {
    setEmailError(validateEmail(email));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validateEmail(email);
    setEmailError(err);
    if (err) return;

    setLoading(true);
    try {
      await forgotPasswordRequest(email.trim());
      setSubmitted(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo-row">
            <div className="zuno-logo">Z</div>
            <span className="auth-logo-text">Zuno</span>
          </div>
          <CheckCircleOutlineRounded sx={{ fontSize: 48, color: 'var(--primary)', mb: 1 }} />
          <h2 className="auth-heading">Email sent</h2>
          <p className="auth-subtext">
            If this email is registered, you'll receive a password reset link shortly. Check your inbox.
          </p>
          <div className="auth-bottom-link">
            <a role="button" tabIndex={0} onClick={() => navigate('/login')} onKeyDown={e => e.key === 'Enter' && navigate('/login')}>Back to login</a>
          </div>
        </div>
        <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo-row">
          <div className="zuno-logo">Z</div>
          <span className="auth-logo-text">Zuno</span>
        </div>

        <h2 className="auth-heading">Reset your password</h2>
        <p className="auth-subtext">Enter your email and we'll send you a reset link.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">
            <div className="auth-field-wrap">
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={handleBlurEmail}
                error={!!emailError}
                fullWidth
                variant="outlined"
                size="small"
                sx={FIELD_SX}
              />
              {emailError && <span className="auth-field-error">{emailError}</span>}
            </div>
          </div>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={isDisabled}
            sx={{
              mt: '20px',
              py: '10px',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              '&:hover': { backgroundColor: 'var(--primary-hover)', boxShadow: 'none' },
              '&.Mui-disabled': { backgroundColor: 'var(--primary)', opacity: 0.5, color: '#ffffff' },
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'none',
            }}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </Button>
        </form>

        <div className="auth-bottom-link">
          <a role="button" tabIndex={0} onClick={() => navigate('/login')} onKeyDown={e => e.key === 'Enter' && navigate('/login')}>Back to login</a>
        </div>
      </div>
      <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
    </div>
  );
}

export default ForgotPasswordPage;
