import React from 'react';

function AppHeader() {
  return (
    <header className="app-header">
      <div className="brand-lockup" aria-label="Zuno">
        <span className="brand-mark">Z</span>
        <div>
          <h1>Zuno</h1>
          <p>Doubt pucho. Samjho. Aage badho.</p>
        </div>
      </div>
      <div className="xp-pill" aria-label="Study mode ready">
        Ready
      </div>
    </header>
  );
}

export default AppHeader;
