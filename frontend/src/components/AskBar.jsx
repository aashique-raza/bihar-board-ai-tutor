import React, { useState } from 'react';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';

function AskBar({ disabled, onAsk, onCancel, studyMode }) {
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
      <Paper className="ask-bar" component="form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="question">
          Ask Zuno a question
        </label>
        <InputBase
          fullWidth
          id="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            studyMode === 'focus'
              ? 'Is chapter ka topic ya question likho...'
              : 'Aaj kya padhna hai? Topic ya question likho...'
          }
          sx={{ color: 'text.primary', px: 1 }}
        />
        {disabled ? (
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
    </Box>
  );
}

export default React.memo(AskBar);
