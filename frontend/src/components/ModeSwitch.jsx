import React from 'react';

import { STUDY_MODES } from '../constants/studyModes.js';

const modes = [
  {
    id: STUDY_MODES.global,
    label: 'Global',
  },
  {
    id: STUDY_MODES.focus,
    label: 'Focus',
  },
];

function ModeSwitch({ activeMode, onChange }) {
  return (
    <div className="mode-switch" aria-label="Study mode">
      {modes.map((mode) => (
        <button
          className={activeMode === mode.id ? 'active' : ''}
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

export default ModeSwitch;
