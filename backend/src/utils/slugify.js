/**
 * Converts a title into a URL/ID-safe slug: lowercase, punctuation/spaces to hyphens,
 * "&" spelled out as "and" (so "Science & Tech" and "Science and Tech" produce the same id).
 *
 * Single source of truth for subject/section/chapter ID generation. Both
 * curriculumIndexBuilder.js (build-time curriculum index) and studyMap.service.js
 * (runtime study map) call this so their generated IDs can never silently drift apart —
 * the same duplication pattern already fixed once for SUBJECT_ORDER/SECTION_ORDER and
 * CHAPTER_HINGLISH (see FOCUS_MODE_PLAN.md Phase E).
 */
export const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
