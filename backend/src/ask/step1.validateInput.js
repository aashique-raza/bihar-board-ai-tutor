import ApiError from '../utils/ApiError.js';
import { findStudyMapChapter } from '../services/studyMap.service.js';

const VALID_STUDY_MODES = ['global', 'focus'];

// Regex check: Kam se kam ek English letter, number, ya Devanagari character hona mandatory hai
// Yeh filter out karega pure emojis, excessive question marks, ya blank symbols ko
const VALID_TEXT_PATTERN = /[a-zA-Z0-9\u0900-\u097F]/;

/**
 * Multiple spaces ko single space me badalta hai aur trim karta hai
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

  console.log('step1.validateInput.js: Validating incoming request data...');
  console.log('Question:', question);
  console.log('StudyMode:', studyMode);
  console.log('SessionId:', requestedSessionId);

  // Guard 1: Empty text validation
  if (!question) {
    throw new ApiError(400, 'Sawal khali nahi ho sakta, babu! Kripya kuch poochiye.');
  }

  // Guard 2: Maximum Length Restriction (500 characters max limit)
  if (question.length > 500) {
    throw new ApiError(400, 'Aapka sawal bahut bada hai, babu! Kripya apne sawal ko 500 characters se kam me likhein.');
  }

  // Guard 3: Gibberish/Pure Emoji/Pure Symbol Verification
  if (!VALID_TEXT_PATTERN.test(question)) {
    throw new ApiError(400, 'Kripya padhai se juda koi sarthak sawal ya shabd likhiye. Sirf emojis ya symbols allowed nahi hain.');
  }

  // Guard 4: Validate Study Modes
  if (!VALID_STUDY_MODES.includes(studyMode)) {
    throw new ApiError(400, 'studyMode galat hai. Yeh sirf "global" ya "focus" ho sakta hai.');
  }

  // Guard 5: ChapterId logic mapping logic for Global Mode
  if (studyMode === 'global' && body.chapterId) {
    throw new ApiError(400, 'Global Mode me chapterId bhejna allowed nahi hai.');
  }

  let focusChapter = null;

  // Guard 6: Focus Mode dynamic validation
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