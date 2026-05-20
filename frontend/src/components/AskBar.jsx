import React, { useState } from 'react';

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
    <form className="ask-bar" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="question">
        Ask Zuno a question
      </label>
      <input
        id="question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={
          studyMode === 'focus'
            ? 'Selected chapter me doubt pucho...'
            : 'Science doubt yahan pucho...'
        }
      />
      <button disabled={disabled || !question.trim()} type="submit">
        Ask
      </button>
    </form>
  );
}

export default AskBar;
