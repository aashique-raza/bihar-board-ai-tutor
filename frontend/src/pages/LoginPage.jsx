import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import { loginUser } from '../services/axios/authService';
import { setCredentials } from '../store/slices/authSlice';

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
  if (!value.trim()) return 'Email daalna zaroori hai';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Sahi email likho (example@gmail.com)';
  return '';
}

function validatePassword(value) {
  if (!value) return 'Password daalna zaroori hai';
  return '';
}

function LoginPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasErrors = !!(errors.email || errors.password);
  const hasEmpty = !email.trim() || !password;
  const isDisabled = hasErrors || hasEmpty || loading;

  function handleBlurEmail() {
    setErrors(e => ({ ...e, email: validateEmail(email) }));
  }
  function handleBlurPassword() {
    setErrors(e => ({ ...e, password: validatePassword(password) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    const pwErr = validatePassword(password);
    setErrors({ email: emailErr, password: pwErr });
    if (emailErr || pwErr) return;

    setLoading(true);
    setSubmitError('');
    try {
      const data = await loginUser({ email: email.trim(), password });
      dispatch(setCredentials({ user: data.user, accessToken: data.accessToken }));
      navigate('/');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo-row">
          <div className="zuno-logo">Z</div>
          <span className="auth-logo-text">Zuno</span>
        </div>

        <h2 className="auth-heading">Wapas aao!</h2>
        <p className="auth-subtext">Apne account mein login karo</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-fields">
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
                          aria-label={showPassword ? 'Password chhupao' : 'Password dikhaao'}
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
            </div>
          </div>

          {submitError && <span className="auth-submit-error">{submitError}</span>}

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
            {loading ? 'Login ho raha hai...' : 'Login Karo'}
          </Button>
        </form>

        <div className="auth-divider">ya</div>

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
          Google se login karo
        </Button>

        <div className="auth-bottom-link">
          Naya account?{' '}
          <a role="button" onClick={() => navigate('/register')}>Register karo</a>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
