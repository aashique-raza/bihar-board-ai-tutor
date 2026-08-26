import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import { getSavedSessionId } from '../utils/session.js';
import { submitSupportRequest, SUPPORT_CATEGORIES } from '../api/supportApi.js';
import Toast from '../components/Toast.jsx';
import ZunoMark from '../components/ZunoMark.jsx';

const CATEGORY_ICONS = {
  bug: BugReportOutlined,
  wrong_answer: ReportProblemOutlined,
  feedback: LightbulbOutlined,
  other: MoreHorizRounded,
};

const FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    '& fieldset': { borderColor: 'var(--border)' },
    '&:hover fieldset': { borderColor: 'var(--border-strong)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--primary)', borderWidth: '1.5px' },
    backgroundColor: 'var(--bg-surface)',
    fontSize: '0.95rem',
  },
  '& .MuiInputLabel-root': { color: 'var(--text-muted)' },
  '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary)' },
  '& .MuiInputBase-input': { color: 'var(--text-primary)' },
  '& .MuiFormHelperText-root': { color: 'var(--text-muted)', marginLeft: 0 },
  '& .MuiFormHelperText-root.Mui-error': { color: 'var(--error)' },
};

const MIN_SUBJECT_LENGTH = 3;
const MIN_DESCRIPTION_LENGTH = 15;

function validateEmail(value) {
  if (!value.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address';
  return '';
}

function validateSubject(value) {
  if (!value.trim()) return 'Subject required hai';
  if (value.trim().length < MIN_SUBJECT_LENGTH) return 'Thoda specific likho';
  return '';
}

function validateDescription(value) {
  if (!value.trim()) return 'Description required hai';
  if (value.trim().length < MIN_DESCRIPTION_LENGTH) return `Thoda aur detail likho (kam se kam ${MIN_DESCRIPTION_LENGTH} characters)`;
  return '';
}

function SupportHeader({ onBack }) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '54px',
        px: { xs: 2, sm: 3 },
        bgcolor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ZunoMark />
        <Typography sx={{ fontFamily: 'var(--font-brand)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
          Zuno
        </Typography>
      </Box>
      <Box
        role="button"
        tabIndex={0}
        onClick={onBack}
        onKeyDown={(e) => e.key === 'Enter' && onBack()}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          '&:hover': { color: 'var(--text-primary)' },
        }}
      >
        <ArrowBackRounded sx={{ fontSize: 16 }} />
        Chat pe wapas
      </Box>
    </Box>
  );
}

function SupportPage() {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const { toast, showToast, hideToast } = useToast();

  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const goToChat = () => navigate('/chat');

  const isDisabled =
    loading ||
    !category ||
    !!validateSubject(subject) ||
    !!validateDescription(description) ||
    (!isLoggedIn && !!validateEmail(email));

  function handleBlurSubject() {
    setErrors((prev) => ({ ...prev, subject: validateSubject(subject) }));
  }

  function handleBlurDescription() {
    setErrors((prev) => ({ ...prev, description: validateDescription(description) }));
  }

  function handleBlurEmail() {
    if (isLoggedIn) return;
    setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
  }

  function handleSelectCategory(value) {
    setCategory(value);
    if (errors.category) setErrors((prev) => ({ ...prev, category: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const nextErrors = {};
    if (!category) nextErrors.category = 'Category chunein';
    const subjectErr = validateSubject(subject);
    if (subjectErr) nextErrors.subject = subjectErr;
    const descriptionErr = validateDescription(description);
    if (descriptionErr) nextErrors.description = descriptionErr;
    if (!isLoggedIn) {
      const emailErr = validateEmail(email);
      if (emailErr) nextErrors.email = emailErr;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      await submitSupportRequest({
        category,
        subject: subject.trim(),
        description: description.trim(),
        email: isLoggedIn ? undefined : email.trim(),
        sessionId: getSavedSessionId() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'var(--bg-page)', display: 'flex', flexDirection: 'column' }}>
        <SupportHeader onBack={goToChat} />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 3, py: 6, textAlign: 'center' }}>
          <CheckCircleOutlineRounded sx={{ fontSize: 48, color: 'var(--primary)', mb: 1.5 }} />
          <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', mb: 1 }}>Shukriya!</Typography>
          <Typography sx={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: 320, mb: 3 }}>
            Tumhara message mil gaya hai. Hum jaldi respond karenge.
          </Typography>
          <Box
            role="button"
            tabIndex={0}
            onClick={goToChat}
            onKeyDown={(e) => e.key === 'Enter' && goToChat()}
            sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', '&:hover': { color: 'var(--primary-hover)' } }}
          >
            Chat pe wapas jao
          </Box>
        </Box>
        <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
      </Box>
    );
  }

  return (
    <>
      <Helmet>
        <title>Help & Support — Zuno AI Tutor</title>
        <meta
          name="description"
          content="Zuno AI Tutor se koi problem hai? Bug report karo, feedback do, ya koi sawaal poochho. Hum 24 ghante mein reply karte hain."
        />
        <link rel="canonical" href="https://learnzuno.in/support" />
      </Helmet>
      <Box sx={{ minHeight: '100vh', bgcolor: 'var(--bg-page)', display: 'flex', flexDirection: 'column' }}>
      <SupportHeader onBack={goToChat} />

      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', px: 2, py: { xs: 4, sm: 6 } }}>
        <Box sx={{ width: '100%', maxWidth: 440 }}>
          <Typography sx={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', mb: 0.75 }}>
            Koi problem hai? Batao, hum help karenge.
          </Typography>

          <form onSubmit={handleSubmit} noValidate>
            {/* Category — visual icon cards instead of a dropdown */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mt: 3 }}>
              {SUPPORT_CATEGORIES.map((opt) => {
                const Icon = CATEGORY_ICONS[opt.value];
                const isSelected = category === opt.value;
                return (
                  <Box
                    key={opt.value}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectCategory(opt.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSelectCategory(opt.value)}
                    style={{
                      borderStyle: 'solid',
                      borderWidth: isSelected ? '1.5px' : '1px',
                      borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                      backgroundColor: isSelected ? 'var(--primary-tint)' : 'var(--bg-surface)',
                    }}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.5,
                      py: 1.25,
                      px: 0.5,
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                  >
                    <Icon sx={{ fontSize: 18, color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }} />
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--primary-label)' : 'var(--text-secondary)', lineHeight: 1.2 }}>
                      {opt.label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
            {errors.category && (
              <Typography sx={{ fontSize: '0.72rem', color: 'var(--error)', mt: 0.75, textAlign: 'center' }}>{errors.category}</Typography>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2.5 }}>
              <TextField
                label="Subject"
                placeholder="Login nahi ho raha"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onBlur={handleBlurSubject}
                error={!!errors.subject}
                helperText={errors.subject || ' '}
                fullWidth
                variant="outlined"
                slotProps={{ input: { startAdornment: <EditOutlined sx={{ fontSize: 18, color: 'var(--text-muted)', mr: 1 }} /> } }}
                sx={FIELD_SX}
              />

              <TextField
                label="Describe your issue"
                placeholder="Kya hua, kab hua, konsa chapter/topic tha — jitna detail utna jaldi help milegi"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleBlurDescription}
                error={!!errors.description}
                helperText={errors.description || ' '}
                multiline
                minRows={4}
                fullWidth
                variant="outlined"
                sx={FIELD_SX}
              />

              {isLoggedIn ? (
                <TextField
                  label="Email"
                  value={user?.email || ''}
                  disabled
                  helperText="Reply isi email pe milega"
                  fullWidth
                  variant="outlined"
                  slotProps={{ input: { startAdornment: <MailOutlineRounded sx={{ fontSize: 18, color: 'var(--text-muted)', mr: 1 }} /> } }}
                  sx={FIELD_SX}
                />
              ) : (
                <TextField
                  label="Email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={handleBlurEmail}
                  error={!!errors.email}
                  helperText={errors.email || 'Reply isi email pe milega'}
                  fullWidth
                  variant="outlined"
                  slotProps={{ input: { startAdornment: <MailOutlineRounded sx={{ fontSize: 18, color: 'var(--text-muted)', mr: 1 }} /> } }}
                  sx={FIELD_SX}
                />
              )}
            </Box>

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={isDisabled}
              sx={{
                mt: 2.5,
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
              {loading ? 'Sending...' : 'Submit'}
            </Button>
          </form>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, mt: 2 }}>
            <AccessTimeRounded sx={{ fontSize: 14, color: 'var(--text-muted)' }} />
            <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Average reply time: 24 ghante ke andar
            </Typography>
          </Box>
        </Box>
      </Box>

      <Toast open={toast.open} message={toast.message} severity={toast.severity} onClose={hideToast} />
      </Box>
    </>
  );
}

export default SupportPage;
