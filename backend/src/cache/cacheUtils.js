import crypto from 'node:crypto';

// Lowercase + trim + collapse spaces + strip punctuation.
// Goal: "Ohm's Law kya hai?" and "ohm's law kya hai" → same key.
export const normalizeQuery = (q) =>
  String(q || '')
    .toLowerCase()
    .trim()
    .replace(/[?।!,.']/g, '')
    .replace(/\s+/g, ' ');

// First 16 hex chars of SHA-256 = 64-bit hash space.
// Collision risk at our scale (< 100k unique queries) is negligible.
export const hashString = (str) =>
  crypto.createHash('sha256').update(str, 'utf8').digest('hex').slice(0, 16);
