import React, { useState } from 'react';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import StopRounded from '@mui/icons-material/StopRounded';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

function AskBar({ disabled, isHistoryLoading, isLocked, isGuestLimited, onGuestLimitClick, onAsk, onCancel, studyMode }) {
  const [question, setQuestion] = useState('');
  const [cancelCooling, setCancelCooling] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!question.trim()) {
      return;
    }

    onAsk(question);
    setQuestion('');
  };

  const handleCancel = () => {
    if (cancelCooling) return;
    setCancelCooling(true);
    onCancel();
    setTimeout(() => setCancelCooling(false), 300);
  };

  return (
    <Box className="ask-area">
      {/* Guest limit banner — takes priority over session lock banner */}
      {isGuestLimited ? (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          mb: 0.75,
          borderRadius: 'var(--radius-md)',
          bgcolor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
        }}>
          <LockOutlined sx={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'var(--text-muted)', flex: 1 }}>
            5 turns ho gaye!{' '}
            <Box
              component="span"
              onClick={onGuestLimitClick}
              sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Login karo
            </Box>
            {' '}— free account mein koi limit nahi.
          </Typography>
        </Box>
      ) : isLocked ? (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          mb: 0.75,
          borderRadius: 'var(--radius-md)',
          bgcolor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
        }}>
          <LockOutlined sx={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>
            Session bhar gaya. Nayi chat mein aage badho.
          </Typography>
        </Box>
      ) : null}

      <Paper className="ask-bar" component="form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="question">
          Ask Zuno a question
        </label>
        <InputBase
          fullWidth
          multiline
          maxRows={4}
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (question.trim()) handleSubmit(event);
            }
          }}
          disabled={isLocked || isGuestLimited || isHistoryLoading || disabled}
          placeholder={
            isGuestLimited
              ? 'Login karke padhai jaari rakho!'
              : isLocked
                ? 'Nayi chat shuru karo'
                : studyMode === 'focus'
                  ? 'Is chapter se kya samajhna hai?'
                  : 'Jaise bhi bolte ho — waise hi likho'
          }
          sx={{ color: 'text.primary', px: 1, alignSelf: 'flex-end' }}
        />
        {/* isLocked and isGuestLimited both hide all buttons — no action possible from input. */}
        {isLocked || isGuestLimited ? null : disabled ? (
          <Tooltip title="Cancel">
            <span>
              <IconButton
                color="error"
                disabled={cancelCooling}
                onClick={handleCancel}
                sx={{
                  bgcolor: 'error.main',
                  color: 'error.contrastText',
                  '&:hover': { bgcolor: 'error.light' },
                }}
              >
                <StopRounded />
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <Tooltip title="Send">
            <span>
              <IconButton
                color="primary"
                disabled={!question.trim() || isHistoryLoading}
                type="submit"
                sx={{
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': { bgcolor: 'primary.light' },
                }}
              >
                <ArrowUpwardRounded />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Paper>
      {/* Hint text — reminds student what Zuno can answer */}
      <div className="ask-hint">
        Zuno sirf Bihar Board Class 10  syllabus se jawab deta hai
      </div>
    </Box>
  );
}

export default React.memo(AskBar);
