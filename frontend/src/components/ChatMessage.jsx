import React from 'react';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockOutlined from '@mui/icons-material/LockOutlined';

const hasStructuredSections = (message) =>
  Array.isArray(message.sections) &&
  message.sections.some((s) => s?.heading || s?.content);

// Prose rendering — heading becomes inline bold lead, content flows after
function MessageSections({ sections }) {
  const filtered = sections.filter((s) => s?.heading || s?.content);
  const showHeadings = filtered.length > 1;
  return (
    <div className="message-prose">
      {filtered.map((section, index) => (
        <p className="prose-paragraph" key={`${section.heading || 'section'}-${index}`}>
          {showHeadings && section.heading && (
            <strong className="prose-lead">{section.heading} — </strong>
          )}
          {section.content}
        </p>
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="thinking-indicator" aria-label="Zuno is preparing an answer">
      <span />
      <span />
      <span />
    </div>
  );
}

function SourceFootnote({ sources }) {
  const chapters = [...new Set(
    sources
      .map((src) => {
        const raw = typeof src === 'string' ? src : (src.label || src.sourceTitle || '');
        // Strip "Source N: " prefix, then take only the chapter name before " - "
        return raw.replace(/^Source\s*\d+:\s*/i, '').split(' - ')[0].trim();
      })
      .filter(Boolean)
  )].slice(0, 2);

  if (!chapters.length) return null;
  return (
    <div className="source-footnote">— {chapters.join(' · ')}</div>
  );
}

function ChatMessage({ message, onSwitchToGlobal }) {
  const isStudent = message.role === 'student';
  const isSystem = message.role === 'system';
  const isFocusMiss = message.status === 'focus_context_not_found';
  const isThinking = message.status === 'thinking';
  const showSections = !isStudent && !isThinking && hasStructuredSections(message);
  const showSources = !isStudent && !isThinking && Array.isArray(message.sources) && message.sources.length > 0;

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

  // Student message — right-aligned ghost bubble
  if (isStudent) {
    return (
      <div className="message-row student-row">
        <div className="student-bubble">{message.answer}</div>
      </div>
    );
  }

  // Zuno message — inline mini avatar + flowing prose
  return (
    <div className="message-row zuno-row">
      <div className="zuno-message">
        {!isThinking && (
          <div className="zuno-header">
            <div className="zuno-avatar-mini">Z</div>
            <span className="message-kicker">Zuno</span>
          </div>
        )}

        {isThinking ? (
          <ThinkingDots />
        ) : showSections ? (
          <MessageSections sections={message.sections} />
        ) : (
          <p className="prose-paragraph">{message.answer}</p>
        )}

        {showSources && <SourceFootnote sources={message.sources} />}

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
