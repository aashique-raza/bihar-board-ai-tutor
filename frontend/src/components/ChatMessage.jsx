import React from 'react';

import SourceChips from './SourceChips.jsx';

function ChatMessage({ message, onSwitchToGlobal }) {
  const isStudent = message.role === 'student';
  const isFocusMiss = message.status === 'focus_context_not_found';

  return (
    <article className={`chat-message ${isStudent ? 'student' : 'zuno'}`}>
      {!isStudent && <span className="message-kicker">Zuno</span>}
      <p>{message.answer}</p>

      {!isStudent && <SourceChips sources={message.sources || []} />}

      {isFocusMiss && (
        <div className="message-actions">
          <button type="button" onClick={() => onSwitchToGlobal(message.question)}>
            Switch to Global
          </button>
        </div>
      )}
    </article>
  );
}

export default ChatMessage;
