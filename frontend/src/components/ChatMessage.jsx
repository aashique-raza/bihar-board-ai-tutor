import React, { useState } from 'react';
import { CHAPTER_HINGLISH } from '../constants/chapterHinglish.js';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import LockOutlined from '@mui/icons-material/LockOutlined';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ShareRounded from '@mui/icons-material/ShareRounded';

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
    <div className="thinking-wrapper">
      <div className="zuno-avatar-mini" style={{ width: 22, height: 22, fontSize: '0.75rem', marginTop: 0 }}>Z</div>
      <div className="thinking-indicator" aria-label="Zuno is preparing an answer">
        <span />
        <span />
        <span />
      </div>
      <span className="thinking-phrase">Zuno soch raha hai...</span>
    </div>
  );
}

const extractChapterName = (src) => {
  // Prefer chapterTitle field directly (avoids " - " truncation bug in label parsing)
  const english = (typeof src === 'object' && src?.chapterTitle)
    ? src.chapterTitle
    : (typeof src === 'string' ? src : (src?.label || src?.sourceTitle || ''))
        .replace(/^Source\s*\d+:\s*/i, '').split(' - ')[0].trim();
  return CHAPTER_HINGLISH[english] || english;
};

function SourceFootnote({ sources }) {
  const chapters = [...new Set(
    sources.map(extractChapterName).filter(Boolean)
  )].slice(0, 2);

  if (!chapters.length) return null;
  return (
    <div className="source-footnote">— {chapters.join(' · ')}</div>
  );
}

const generateShareText = (msg) => {
  let text = '';
  if (hasStructuredSections(msg)) {
    text = msg.sections
      .filter((s) => s?.heading || s?.content)
      .map((s) => {
        if (s.heading) return `${s.heading} — ${s.content}`;
        return s.content;
      })
      .join('\n\n');
  } else {
    text = msg.answer || '';
  }

  if (Array.isArray(msg.sources) && msg.sources.length > 0) {
    const chapters = [...new Set(
      msg.sources.map(extractChapterName).filter(Boolean)
    )].slice(0, 2);
    
    if (chapters.length > 0) {
      text += `\n\nSources: ${chapters.join(' · ')}`;
    }
  }

  text += '\n\n— Answered by Zuno AI';
  return text;
};

function ChatMessage({ message, onSwitchToGlobal, onSuggestedAction }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const text = generateShareText(message);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleShare = async () => {
    try {
      const text = generateShareText(message);
      if (navigator.share) {
        await navigator.share({
          title: 'Zuno AI Answer',
          text: text,
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to share: ', err);
      }
    }
  };

  const isStudent = message.role === 'student';
  const isSystem = message.role === 'system';
  const isFocusMiss = message.status === 'focus_context_not_found';
  const isThinking = message.status === 'thinking';
  const showSections = !isStudent && !isThinking && hasStructuredSections(message);
  const showSources = !isStudent && !isThinking && Array.isArray(message.sources) && message.sources.length > 0;
  const isAcademic = message.responseMode === 'study_tutor' || showSources;

  if (isSystem) {
    return (
      <Box 
        className={message.isNew ? 'message-animate-in' : ''}
        sx={{
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

  if (isStudent) {
    return (
      <div className={`message-row student-row ${message.isNew ? 'message-animate-in' : ''}`}>
        <div className="student-bubble">{message.answer}</div>
      </div>
    );
  }

  // Zuno message — inline mini avatar + flowing prose
  return (
    <div className={`message-row zuno-row ${message.isNew ? 'message-animate-in' : ''}`}>
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

        {(isAcademic && !isThinking && !isStudent && !isSystem) && (
          <div className="message-actions">
            <Tooltip title={copied ? "Copied!" : "Copy"} placement="top">
              <IconButton size="small" onClick={handleCopy} aria-label="Copy message">
                {copied ? <CheckRounded fontSize="small" color="success" /> : <ContentCopyRounded fontSize="small" />}
              </IconButton>
            </Tooltip>
            {typeof navigator !== 'undefined' && navigator.canShare && (
              <Tooltip title="Share" placement="top">
                <IconButton size="small" onClick={handleShare} aria-label="Share message">
                  <ShareRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </div>
        )}

        {Array.isArray(message.suggestedActions) && message.suggestedActions.length > 0 && !isThinking && !isStudent && !isSystem && (
          <div className="suggested-actions">
            {message.suggestedActions.map((action, i) => (
              <button 
                key={i} 
                className="action-chip"
                onClick={() => onSuggestedAction && onSuggestedAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

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
