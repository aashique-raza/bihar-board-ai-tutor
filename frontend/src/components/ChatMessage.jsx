import React from 'react';
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

function ChatMessage({ message, onSwitchToGlobal }) {
  const isStudent = message.role === 'student';
  const isFocusMiss = message.status === 'focus_context_not_found';
  const isThinking = message.status === 'thinking';

  return (
    <div className={`message-row ${isStudent ? 'student-row' : 'zuno-row'}`}>
      {!isStudent && (
        <Avatar className="zuno-avatar">
          <SchoolRounded fontSize="small" />
        </Avatar>
      )}

      <Paper className={`chat-message ${isStudent ? 'student' : 'zuno'}`}>
        {!isStudent && !isThinking && (
          <Typography className="message-kicker" variant="caption">
            Zuno
          </Typography>
        )}

        {isThinking ? (
          <Box className="thinking-indicator" aria-label="Zuno is preparing an answer">
            <span />
            <span />
            <span />
          </Box>
        ) : (
          <Typography component="p">{message.answer}</Typography>
        )}

        {isFocusMiss && (
          <Box sx={{ mt: 1.5 }}>
            <Button
              color="secondary"
              type="button"
              variant="outlined"
              onClick={() => onSwitchToGlobal(message.question)}
            >
              Search globally
            </Button>
          </Box>
        )}
      </Paper>
    </div>
  );
}

export default ChatMessage;
