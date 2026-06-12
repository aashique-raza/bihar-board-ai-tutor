import React from 'react';

function SourceChips({ sources }) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return (
    <div className="source-chips">
      {sources.map((src, i) => (
        <span className="source-chip" key={`${src}-${i}`}>
          {src}
        </span>
      ))}
    </div>
  );
}

export default SourceChips;
