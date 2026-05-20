import React from 'react';

function EmptyState({ studyMode, selectedChapter }) {
  return (
    <section className="empty-state">
      <span>{studyMode === 'focus' ? 'Focus mode' : 'Global mode'}</span>
      <h2>
        {studyMode === 'focus' && selectedChapter
          ? selectedChapter.title
          : 'What should we solve today?'}
      </h2>
      <p>
        {studyMode === 'focus'
          ? 'Zuno ab sirf selected chapter ke indexed content se answer dega.'
          : 'Zuno available indexed Science content me se grounded answer dega.'}
      </p>
    </section>
  );
}

export default EmptyState;
