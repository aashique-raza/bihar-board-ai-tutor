import React from 'react';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockOutlined from '@mui/icons-material/LockOutlined';
import SourceChips from './SourceChips.jsx';

// Returns true if message has at least one section with heading or content
const hasStructuredSections = (message) =>
  Array.isArray(message.sections) &&
  message.sections.some((s) => s?.heading || s?.content);

// Renders AI response sections — each section has an optional heading with left bar + content
function MessageSections({ sections }) {
  return (
    <div className="message-sections">
      {sections
        .filter((s) => s?.heading || s?.content)
        .map((section, index) => (
          <div className="section-block" key={`${section.heading || 'section'}-${index}`}>
            {section.heading && (
              <div className="section-heading">{section.heading}</div>
            )}
            {section.content && (
              <div className="section-content">{section.content}</div>
            )}
          </div>
        ))}
    </div>
  );
}

// Animated thinking dots — shown while Zuno is preparing a response
function ThinkingDots() {
  return (
    <div className="thinking-indicator" aria-label="Zuno is preparing an answer">
      <span />
      <span />
      <span />
    </div>
  );
}

function ChatMessage({ message, onSwitchToGlobal }) {
  const isStudent = message.role === 'student';
  const isSystem = message.role === 'system';
  const isFocusMiss = message.status === 'focus_context_not_found';
  const isThinking = message.status === 'thinking';
  const showSections = !isStudent && !isThinking && hasStructuredSections(message);
  const showSources = !isStudent && !isThinking && Array.isArray(message.sources) && message.sources.length > 0;

  // System notice — centered muted row (lock, cap notices)
  if (isSystem) {
    return (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        py: 2,
        color: 'var(--text-muted)',
      }}>
        <LockOutlined sx={{ fontSize: 14 }} />
        <Typography variant="caption">{message.answer}</Typography>
      </Box>
    );
  }

  // Student message — right-aligned bubble
  if (isStudent) {
    return (
      <div className="message-row student-row">
        <div className="student-bubble">
          {message.answer}
        </div>
      </div>
    );
  }

  // Zuno message — free text layout with avatar on left
  return (
    <div className="message-row zuno-row">
      {/* Avatar — plain div with "Z", no MUI icon */}
      <div className="zuno-avatar">Z</div>

      {/* Message content */}
      <div className="zuno-message">
        {!isThinking && (
          <div className="message-kicker">Zuno</div>
        )}

        {isThinking ? (
          <ThinkingDots />
        ) : showSections ? (
          <MessageSections sections={message.sections} />
        ) : (
          <div className="section-content">{message.answer}</div>
        )}

        {/* Source chips — shown below content */}
        {showSources && (
          <SourceChips sources={message.sources} />
        )}

        {/* Focus miss button */}
        {isFocusMiss && (
          <div style={{ marginTop: '12px' }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => onSwitchToGlobal(message.question)}
              sx={{
                borderColor: 'var(--border-strong)',
                color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.8rem',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': {
                  borderColor: 'var(--primary)',
                  color: 'var(--primary)',
                  bgcolor: 'transparent',
                },
              }}
            >
              Search globally
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatMessage;
