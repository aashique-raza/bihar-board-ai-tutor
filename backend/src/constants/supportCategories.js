// Static list, not a DB-backed model — a handful of categories that rarely
// change. Adding one is a one-line edit here, no migration needed since the
// model stores category as a plain String (no schema-level enum).
export const SUPPORT_CATEGORIES = ['bug', 'wrong_answer', 'feedback', 'other'];
