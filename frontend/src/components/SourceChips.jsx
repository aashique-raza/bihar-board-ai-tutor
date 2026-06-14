import React from 'react';

function SourceChips({ sources }) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return (
    <div className="source-chips">
      {sources.map((src, i) => {
        const label = typeof src === 'string' ? src : (src.label || src.sourceTitle || `Source ${i + 1}`);
        const key = typeof src === 'string' ? `${src}-${i}` : `${src.sourceId || i}-${i}`;
        return (
          <span className="source-chip" key={key}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

export default SourceChips;
