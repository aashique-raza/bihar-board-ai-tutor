import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import { resetPasswordRequest } from '../services/axios/authService';
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

function validateNewPassword(value) {
  if (!value) return 'New password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (!/\d/.test(value)) return 'Password must contain at least one number';
  if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
  return '';
}

function validateConfirmPassword(newPw, confirmPw) {
  if (!confirmPw) return 'Please confirm your password';
  if (newPw !== confirmPw) return 'Passwords do not match';
  return '';
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast, showToast, hideToast } = useToast();

  const [token, setToken] = useState('');
  const [tokenMissing, setTokenMissing] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({ newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const t = searchParams.get('token');
    if (!t) {
      setTokenMissing(true);
    } else {
      setToken(t);
    }
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => navigate('/login', { state: { toastSuccess: 'Password reset ho gaya! Ab login karo.' } }), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  function handleBlurNew() {
    setErrors(e => ({ ...e, newPassword: validateNewPassword(newPassword) }));
  }
  function handleBlurConfirm() {
    setErrors(e => ({ ...e, confirmPassword: validateConfirmPassword(newPassword, confirmPassword) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const newErr = validateNewPassword(newPassword);
    const confirmErr = validateConfirmPassword(newPassword, confirmPassword);
    setErrors({ newPassword: newErr, confirmPassword: confirmErr });
    if (newErr || confirmErr) return;

    setLoading(true);
    try {
      await resetPasswordRequest(token, newPassword);
      setSuccess(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const hasErrors = !!(errors.newPassword || errors.confirmPassword);
  const hasEmpty = !newPassword || !confirmPassword;
  const isDisabled = hasErrors || hasEmpty || loading;

  if (tokenMissing) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo-row">
            <div className="zuno-logo">Z</div>
            <span className="auth-logo-text">Zuno</span>
          </div>
          <ErrorOutlineRounded sx={{ fontSize: 48, color: 'var(--error)', mb: 1 }} />
          <h2 className="auth-heading">Invalid reset link</h2>
          <p className="auth-subtext">This link is invalid or has expired.</p>
          <Button
            variant="outlined"
            fullWidth
            onClick={() => navigate('/forgot-password')}
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
            Request a new link
          </Button>
        </div>
        <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
      </div>
    );
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo-row">
            <div className="zuno-logo">Z</div>
            <span className="auth-logo-text">Zuno</span>
          </div>
          <CheckCircleOutlineRounded sx={{ fontSize: 48, color: 'var(--primary)', mb: 1 }} />
          <h2 className="auth-heading">Password reset successful</h2>
          <p className="auth-subtext">Redirecting to login in 3 seconds...</p>
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

        <h2 className="auth-heading">Set a new password</h2>
        <p className="auth-subtext" style={{ marginBottom: '20px' }}>
          Your new password must be at least 8 characters.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">
            <div className="auth-field-wrap">
              <TextField
                label="New Password"
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onBlur={handleBlurNew}
                error={!!errors.newPassword}
                fullWidth
                variant="outlined"
                size="small"
                sx={FIELD_SX}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowNewPassword(v => !v)}
                          edge="end"
                          size="small"
                          tabIndex={-1}
                          aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                          sx={{ color: 'var(--text-muted)' }}
                        >
                          {showNewPassword
                            ? <VisibilityOffRounded fontSize="small" />
                            : <VisibilityRounded fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {errors.newPassword && <span className="auth-field-error">{errors.newPassword}</span>}
            </div>

            <div className="auth-field-wrap">
              <TextField
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onBlur={handleBlurConfirm}
                error={!!errors.confirmPassword}
                fullWidth
                variant="outlined"
                size="small"
                sx={FIELD_SX}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowConfirmPassword(v => !v)}
                          edge="end"
                          size="small"
                          tabIndex={-1}
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          sx={{ color: 'var(--text-muted)' }}
                        >
                          {showConfirmPassword
                            ? <VisibilityOffRounded fontSize="small" />
                            : <VisibilityRounded fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {errors.confirmPassword && <span className="auth-field-error">{errors.confirmPassword}</span>}
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
            {loading ? 'Resetting...' : 'Reset Password'}
          </Button>
        </form>
      </div>
      <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
    </div>
  );
}

export default ResetPasswordPage;
