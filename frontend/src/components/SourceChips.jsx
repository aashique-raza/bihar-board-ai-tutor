import React from 'react';

function SourceChips({ sources }) {
  if (!sources.length) {
    return null;
  }

  return (
    <div className="source-chips" aria-label="Answer sources">
      {sources.map((source) => (
        <span key={`${source.sourceNumber}-${source.chunkId}`}>
          {source.label || source.sourceTitle || `${source.chapterTitle} / ${source.headingPath}`}
        </span>
      ))}
    </div>
  );
}

export default SourceChips;
