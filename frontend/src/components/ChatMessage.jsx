import React from 'react';
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const hasStructuredSections = (message) =>
  Array.isArray(message.sections) &&
  message.sections.some((section) => section?.heading || section?.content);

function MessageSections({ sections }) {
  return (
    <Stack className="message-sections" spacing={1.35}>
      {sections
        .filter((section) => section?.heading || section?.content)
        .map((section, index) => (
          <Box className="message-section" key={`${section.heading || 'section'}-${index}`}>
            {section.heading && (
              <Typography className="message-section-heading" component="h3">
                {section.heading}
              </Typography>
            )}
            {section.content && (
              <Typography className="message-section-content" component="p">
                {section.content}
              </Typography>
            )}
          </Box>
        ))}
    </Stack>
  );
}

function ChatMessage({ message, onSwitchToGlobal }) {
  const isStudent = message.role === 'student';
  const isFocusMiss = message.status === 'focus_context_not_found';
  const isThinking = message.status === 'thinking';
  const shouldRenderSections = !isStudent && hasStructuredSections(message);

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
        ) : shouldRenderSections ? (
          <MessageSections sections={message.sections} />
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
