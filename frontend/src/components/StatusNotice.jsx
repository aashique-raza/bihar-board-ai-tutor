import React from 'react';

function StatusNotice({ error }) {
  if (!error) {
    return null;
  }

  return (
    <div className="status-notice" role="alert">
      {error}
    </div>
  );
}

export default StatusNotice;
