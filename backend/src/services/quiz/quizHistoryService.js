/**
 * quizHistoryService.js
 *
 * GET /api/v1/quiz/history — paginated summary list of a student's past quiz
 * attempts, newest first. Cursor-based (createdAt), not offset-based, so
 * results stay stable even as new attempts are created between page fetches.
 */

import { QuizAttempt } from '../../models/quizAttempt.model.js';
import { QuizSession } from '../../models/quizSession.model.js';
import { fetchQuestionsById } from './quizSubmitter.js';
import { toSubmitResultQuestion, toAttemptDetailResponse } from '../../utils/quizResponse.js';

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

/**
 * GET /api/v1/quiz/history/:attemptId — full result detail for one past
 * attempt, options rendered in the order the student actually saw them
 * (session.optionOrder), same fallback-to-DB-order rule as the submit
 * response's idempotent-replay path if the session has since TTL-expired.
 * Returns null if the attempt doesn't exist or isn't owned by this identity
 * — caller maps that to a single generic 404 (never distinguishes the two).
 */
export const getQuizAttemptDetail = async ({ attemptId, userId, guestId }) => {
  const identityFilter = buildIdentityFilter(userId, guestId);
  const attempt = await QuizAttempt.findOne({ _id: attemptId, ...identityFilter }).lean();
  if (!attempt) return null;

  const questionIds = attempt.answers.map((a) => a.questionId);
  const questionById = await fetchQuestionsById(questionIds);

  const session = await QuizSession.findById(attempt.sessionId, { questions: 1 }).lean();
  const sessionQuestionById = new Map(
    (session?.questions || []).map((sq) => [String(sq.questionId), sq])
  );

  // Defensive: a question could theoretically be missing (hard-deleted —
  // never happens via the seed script, but not physically impossible). Skip
  // that one result entry rather than crashing the whole detail response.
  const resultQuestions = attempt.answers
    .map((a) => {
      const question = questionById.get(String(a.questionId));
      if (!question) return null;

      const sessionQuestion = sessionQuestionById.get(String(a.questionId));
      const optionOrder = sessionQuestion?.optionOrder ?? question.options.map((o) => o.label);

      return toSubmitResultQuestion(
        { questionId: a.questionId, optionOrder, correctOptionLabel: a.correctOptionLabel },
        question,
        { selectedOption: a.selectedOption, isCorrect: a.isCorrect, timeSpentMs: a.timeSpentMs }
      );
    })
    .filter(Boolean);

  return toAttemptDetailResponse(attempt, resultQuestions);
};
