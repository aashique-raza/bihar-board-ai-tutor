import React, { useState } from 'react';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';

function AskBar({ disabled, onAsk, studyMode }) {
  const [question, setQuestion] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!question.trim()) {
      return;
    }

    onAsk(question);
    setQuestion('');
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
        <Tooltip title="Send">
          <span>
            <IconButton
              color="primary"
              disabled={disabled || !question.trim()}
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
      </Paper>
    </Box>
  );
}

export default AskBar;
