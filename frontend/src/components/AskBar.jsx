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

function AskBar({ disabled, isLocked, onAsk, onCancel, studyMode }) {
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
      {/* Lock notice — shown when session is exhausted (BUG-1: separate from disabled) */}
      {isLocked && (
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
            Is session ki limit reach ho gayi. Nayi chat shuru karo.
          </Typography>
        </Box>
      )}

      <Paper className="ask-bar" component="form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="question">
          Ask Zuno a question
        </label>
        <InputBase
          fullWidth
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={isLocked}
          placeholder={
            isLocked
              ? 'Nayi chat shuru karo'
              : studyMode === 'focus'
                ? 'Is chapter ka topic ya question likho...'
                : 'Aaj kya padhna hai? Topic ya question likho...'
          }
          sx={{ color: 'text.primary', px: 1 }}
        />
        {/* BUG-1 FIX: isLocked hides both buttons — session is over, no action possible.
            disabled (in-flight request) shows cancel. Otherwise shows send. */}
        {isLocked ? null : disabled ? (
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
                disabled={!question.trim()}
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
        Zuno sirf Bihar Board Class 10 Science syllabus se jawab deta hai
      </div>
    </Box>
  );
}

export default React.memo(AskBar);
