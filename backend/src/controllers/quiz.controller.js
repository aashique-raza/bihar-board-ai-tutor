/**
 * quiz.controller.js
 *
 * HTTP handlers for the /api/v1/quiz routes.
 * Reads userId from req.user (auth middleware) or guestId from X-Guest-Id header
 * — same identity pattern as chapterProgress.controller.js.
 */

import { generateQuiz } from '../services/quiz/quizGenerator.js';
import { QUIZ_TYPES, GUEST_ID_MAX_LENGTH } from '../constants/quizConstants.js';
import { sendResponse } from '../utils/sendResponse.js';
import ApiError from '../utils/ApiError.js';

const extractIdentity = (req) => {
  const userId = req.user?.id || null;
  if (userId) return { userId, guestId: null };

  const rawGuestId = req.headers['x-guest-id'] || null;
  // An oversized header is either a bug or an attempt to abuse the Redis
  // rate-limit key namespace — treat it the same as no identity at all.
  const guestId = rawGuestId && rawGuestId.length <= GUEST_ID_MAX_LENGTH ? rawGuestId : null;

  return { userId: null, guestId };
};

// ─── POST /api/v1/quiz/generate ───────────────────────────────────────────────

export const generateQuizController = async (req, res, next) => {
  try {
    const { userId, guestId } = extractIdentity(req);
    if (!userId && !guestId) {
      return next(new ApiError(400, 'Identity required — login or a valid X-Guest-Id header is missing.'));
    }

    const { quizType, subjectId, chapterId } = req.body;

    if (!QUIZ_TYPES.includes(quizType)) {
      return next(new ApiError(400, `quizType must be one of: ${QUIZ_TYPES.join(', ')}`));
    }
    if (!subjectId) {
      return next(new ApiError(400, 'subjectId is required.'));
    }
    if (quizType !== 'mix_practice' && !chapterId) {
      return next(new ApiError(400, 'chapterId is required for this quizType.'));
    }

    const quiz = await generateQuiz({ userId, guestId, quizType, subjectId, chapterId });

    return sendResponse(res, 200, {
      message: 'Quiz generated.',
      data: quiz,
    });
  } catch (error) {
    next(error);
  }
};
