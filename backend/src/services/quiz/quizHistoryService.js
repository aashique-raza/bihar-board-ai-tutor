/**
 * quizHistoryService.js
 *
 * GET /api/v1/quiz/history — paginated summary list of a student's past quiz
 * attempts, newest first. Cursor-based (createdAt), not offset-based, so
 * results stay stable even as new attempts are created between page fetches.
 */

import { QuizAttempt } from '../../models/quizAttempt.model.js';

const buildIdentityFilter = (userId, guestId) => (userId ? { userId } : { guestId });

export const getQuizHistory = async ({ userId, guestId, quizType, chapterId, cursor, limit }) => {
  const filter = { ...buildIdentityFilter(userId, guestId) };
  if (quizType) filter.quizType = quizType;
  // chapter_gate/chapter_practice store the chapter in `chapterId`; mix_practice
  // stores it in `chapterIds[]` instead (chapterId is null there) — match either
  // so a chapter filter doesn't silently drop mix_practice attempts that covered it.
  if (chapterId) filter.$or = [{ chapterId }, { chapterIds: chapterId }];
  if (cursor) filter.createdAt = { $lt: cursor };

  // Fetch one extra row to detect "is there a next page" without a second count query.
  const docs = await QuizAttempt.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = docs.length > limit;
  const attempts = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? attempts[attempts.length - 1].createdAt : null;

  return { attempts, nextCursor, hasMore };
};
