export const QUIZ_TYPES = ['chapter_gate', 'chapter_practice', 'mix_practice'];

// Decisions 1-4, QUIZ_SYSTEM_BLUEPRINT.md §16 — never accept a client-supplied count,
// server always decides how many questions a quiz has.
export const QUESTION_COUNTS = {
  chapter_gate: 10,
  chapter_practice: 10,
  mix_practice: 20,
};

export const SESSION_TTL_MIN = 50;

// Caps the X-Guest-Id header before it is used to build a Redis rate-limit key.
export const GUEST_ID_MAX_LENGTH = 100;
