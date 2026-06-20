import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import { registerUser } from '../services/axios/authService';
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

function getPasswordStrength(password) {
  const len = password.length;
  const hasNumber = /\d/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if (len >= 10 && hasNumber && hasUpper && hasSpecial) {
    return { label: 'Strong', color: '#22c55e', width: '100%' };
  }
  if (len >= 8 && hasNumber && hasUpper) {
    return { label: 'Good', color: '#84cc16', width: '75%' };
  }
  if (len >= 6) {
    return { label: 'Fair', color: '#f97316', width: '50%' };
  }
  return { label: 'Weak', color: '#ef4444', width: '25%' };
}

function validateName(value) {
  if (!value.trim()) return 'Name is required';
  if (value.trim().length < 2) return 'Name must be at least 2 characters';
  if (value.trim().length > 50) return 'Name is too long';
  return '';
}

function validateEmail(value) {
  if (!value.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address';
  return '';
}

function validatePassword(value) {
  if (!value) return 'Password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (!/\d/.test(value)) return 'Password must contain at least one number';
  if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
  return '';
}

function RegisterPage() {
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const strength = password ? getPasswordStrength(password) : null;
  const hasErrors = !!(errors.name || errors.email || errors.password);
  const hasEmpty = !name.trim() || !email.trim() || !password;
  const isDisabled = hasErrors || hasEmpty || loading;

  function handleBlurName() {
    setErrors(e => ({ ...e, name: validateName(name) }));
  }
  function handleBlurEmail() {
    setErrors(e => ({ ...e, email: validateEmail(email) }));
  }
  function handleBlurPassword() {
    setErrors(e => ({ ...e, password: validatePassword(password) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nameErr = validateName(name);
    const emailErr = validateEmail(email);
    const pwErr = validatePassword(password);
    setErrors({ name: nameErr, email: emailErr, password: pwErr });
    if (nameErr || emailErr || pwErr) return;

    setLoading(true);
    try {
      await registerUser({ name: name.trim(), email: email.trim(), password });
      setSubmitted(true);
      showToast('Verification email sent! Please check your inbox.', 'success');
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
          <CheckCircleOutlineRounded
            sx={{ fontSize: 48, color: 'var(--primary)', mb: 1 }}
          />
          <h2 className="auth-heading">Check your email</h2>
          <p className="auth-subtext" style={{ whiteSpace: 'normal' }}>
            We've sent a verification link to your email address.
            The link is valid for 24 hours.
          </p>
          <div className="auth-bottom-link">
            <a role="button" onClick={() => navigate('/login')}>Go to login →</a>
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

        <h2 className="auth-heading">Create your account</h2>
        <p className="auth-subtext">Your AI tutor for Bihar Board Class 10 Science</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">
            <div className="auth-field-wrap">
              <TextField
                label="Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={handleBlurName}
                error={!!errors.name}
                fullWidth
                variant="outlined"
                size="small"
                sx={FIELD_SX}
              />
              {errors.name && <span className="auth-field-error">{errors.name}</span>}
            </div>

            <div className="auth-field-wrap">
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={handleBlurEmail}
                error={!!errors.email}
                fullWidth
                variant="outlined"
                size="small"
                sx={FIELD_SX}
              />
              {errors.email && <span className="auth-field-error">{errors.email}</span>}
            </div>

            <div className="auth-field-wrap">
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onBlur={handleBlurPassword}
                error={!!errors.password}
                fullWidth
                variant="outlined"
                size="small"
                sx={FIELD_SX}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(v => !v)}
                          edge="end"
                          size="small"
                          tabIndex={-1}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          sx={{ color: 'var(--text-muted)' }}
                        >
                          {showPassword
                            ? <VisibilityOffRounded fontSize="small" />
                            : <VisibilityRounded fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {errors.password && <span className="auth-field-error">{errors.password}</span>}
              {password && strength && (
                <div className="auth-strength">
                  <div className="password-strength-bar-track">
                    <div
                      className="password-strength-bar-fill"
                      style={{ width: strength.width, backgroundColor: strength.color }}
                    />
                  </div>
                  <span className="password-strength-label">{strength.label}</span>
                </div>
              )}
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
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>

        <div className="auth-divider">or</div>

        <Button
          variant="outlined"
          fullWidth
          onClick={() => {
            window.location.href = `${import.meta.env.VITE_API_BASE_URL}/api/v1/auth/google`;
          }}
          sx={{
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
          Continue with Google
        </Button>

        <div className="auth-bottom-link">
          Already have an account?{' '}
          <a role="button" onClick={() => navigate('/login')}>Sign in</a>
        </div>
      </div>
      <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
    </div>
  );
}

export default RegisterPage;
