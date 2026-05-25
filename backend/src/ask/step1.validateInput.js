/**
 * step1.validateInput.js — Step 1 of the Ask API flow
 *
 * WHAT IT DOES:
 *   Validates the incoming request body before anything else happens.
 *   - Checks that a question is present
 *   - Checks that studyMode is either "global" or "focus"
 *   - In Focus Mode, validates that chapterId exists and is a real chapter
 *
 * RETURNS:
 *   { question, studyMode, requestedSessionId, focusChapter }
 *   focusChapter is null in Global Mode, or a chapter object in Focus Mode.
 *
 * THROWS:
 *   ApiError(400) if validation fails
 *   ApiError(404) if Focus Mode chapter is not found
 */

import { randomUUID } from 'node:crypto';

import ApiError from '../utils/ApiError.js';
import { findStudyMapChapter } from '../services/studyMap.service.js';

const VALID_STUDY_MODES = ['global', 'focus'];

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/**
 * Validates the question, studyMode, and chapterId from the request body.
 *
 * @param {object} body - Raw request body from the Express controller
 * @returns {{ question, studyMode, requestedSessionId, focusChapter }}
 */
export const validateInput = async (body = {}) => {
  const question = cleanText(body.question);
  const studyMode = cleanText(body.studyMode);
  const requestedSessionId = cleanText(body.sessionId);

  console.log('step1.validateInput.js: body', body);
  console.log('step1.validateInput.js: question', question);
  console.log('step1.validateInput.js: studyMode', studyMode);
  console.log('step1.validateInput.js: requestedSessionId', requestedSessionId);

  // question is mandatory
  if (!question) {
    throw new ApiError(400, 'question is required.');
  }

  // studyMode must be "global" or "focus"
  if (!VALID_STUDY_MODES.includes(studyMode)) {
    throw new ApiError(400, 'studyMode must be either "global" or "focus".');
  }

  // chapterId is only allowed in Focus Mode
  if (studyMode === 'global' && body.chapterId) {
    throw new ApiError(400, 'chapterId is allowed only when studyMode is "focus".');
  }

  // Focus Mode: chapterId is required and must match a real chapter
  let focusChapter = null;

  if (studyMode === 'focus') {
    const chapterId = cleanText(body.chapterId);

    if (!chapterId) {
      throw new ApiError(400, 'chapterId is required when studyMode is "focus".');
    }

    focusChapter = await findStudyMapChapter(chapterId);

    if (!focusChapter) {
      throw new ApiError(404, `Chapter not found for chapterId: ${chapterId}`);
    }
  }

  return {
    question,
    studyMode,
    requestedSessionId,
    focusChapter, // null for global mode, chapter object for focus mode
  };
};
