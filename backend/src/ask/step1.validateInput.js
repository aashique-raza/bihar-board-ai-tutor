import ApiError from '../utils/ApiError.js';
import { findStudyMapChapter } from '../services/studyMap.service.js';

const VALID_STUDY_MODES = ['global', 'focus'];
const isDev = process.env.NODE_ENV !== 'production';

// Question must contain at least one letter, number, or Devanagari character.
// This filters out pure emojis, "?????", or blank/symbol-only input.
const VALID_TEXT_PATTERN = /[a-zA-Z0-9\u0900-\u097F]/;

// UUID v4 format: 8-4-4-4-12 hex chars separated by dashes
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Collapses repeated spaces into one and trims the ends.
 */
const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/**
 * Validates the question, studyMode, and chapterId from the request body.
 * Implements deterministic safety guards for Zuno.
 *
 * @param {object} body - Raw request body from the Express controller
 * @returns {Promise<{ question, studyMode, requestedSessionId, focusChapter }>}
 */
export const validateInput = async (body = {}) => {
  const question = cleanText(body.question);
  const studyMode = cleanText(body.studyMode);
  const requestedSessionId = cleanText(body.sessionId);

  if (isDev) console.log(`[Step 1] Validating input — studyMode: ${studyMode}, sessionId: ${requestedSessionId}`);

  // Guard 1: sessionId UUID format (only when provided — new sessions don't send one)
  if (requestedSessionId && !UUID_REGEX.test(requestedSessionId)) {
    throw new ApiError(400, 'Invalid session ID format.');
  }

  // Guard 2: Empty text validation
  if (!question) {
    throw new ApiError(400, 'Sawal khali nahi ho sakta! Kripya kuch poochiye.');
  }

  // Guard 3: Maximum Length Restriction (500 characters max limit)
  if (question.length > 500) {
    throw new ApiError(400, 'Aapka sawal bahut bada hai! Kripya apne sawal ko 500 characters se kam me likhein.');
  }

  // Guard 4: Gibberish/Pure Emoji/Pure Symbol Verification
  if (!VALID_TEXT_PATTERN.test(question)) {
    throw new ApiError(400, 'Kripya padhai se juda koi sarthak sawal ya shabd likhiye. Sirf emojis ya symbols allowed nahi hain.');
  }

  // Guard 5: Validate Study Modes
  if (!VALID_STUDY_MODES.includes(studyMode)) {
    throw new ApiError(400, 'studyMode galat hai. Yeh sirf "global" ya "focus" ho sakta hai.');
  }

  // Guard 6: ChapterId not allowed in Global Mode
  if (studyMode === 'global' && body.chapterId) {
    throw new ApiError(400, 'Global Mode me chapterId bhejna allowed nahi hai.');
  }

  let focusChapter = null;

  // Guard 7: Focus Mode dynamic validation
  if (studyMode === 'focus') {
    const chapterId = cleanText(body.chapterId);

    if (!chapterId) {
      throw new ApiError(400, 'Focus Mode ke liye chapterId dena zaroori hai.');
    }

    // Dynamic database/curriculum map lookup
    focusChapter = await findStudyMapChapter(chapterId);

    if (!focusChapter) {
      throw new ApiError(404, `Diya gaya chapterId system me nahi mila: ${chapterId}`);
    }
  }

  return {
    question,
    studyMode,
    requestedSessionId,
    focusChapter, // null in global mode, hydrated object in focus mode
  };
};