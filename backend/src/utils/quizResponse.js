/**
 * quizResponse.js
 *
 * Whitelist-based response shaping for quiz APIs. Builds the client-facing
 * question shape field-by-field instead of stripping fields from the DB doc —
 * a new field added to the Question model later can never leak (correctOptionLabel,
 * explanation, topicId) just by forgetting to blacklist it here.
 */

import { applyOptionOrder, pickLocalizedText } from '../services/quiz/optionShuffler.js';
import { PASS_PERCENTAGE } from '../constants/quizConstants.js';

export const toClientQuestion = (question, optionOrder) => ({
  questionId: String(question._id),
  text: pickLocalizedText(question.questionText),
  options: applyOptionOrder(question, optionOrder),
  askedInYears: question.askedInYears,

});

/**
 * Builds one result entry for the submit response. Options are rendered in the
 * SAME order the student saw them at generate time (session.optionOrder), not
 * the question's DB order — otherwise "the B I picked" would silently point at
 * a different option in the result view. Explanation is whitelisted here for
 * the first time — it is never sent at generate time.
 */
export const toSubmitResultQuestion = (sessionQuestion, question, scoredAnswer) => ({
  questionId: String(sessionQuestion.questionId),
  text: pickLocalizedText(question.questionText),
  options: applyOptionOrder(question, sessionQuestion.optionOrder),
  selectedOption: scoredAnswer.selectedOption,
  correctOption: sessionQuestion.correctOptionLabel,
  isCorrect: scoredAnswer.isCorrect,
  explanation: pickLocalizedText(question.explanation),
  timeSpentMs: scoredAnswer.timeSpentMs,
});

export const toSubmitResponse = (attempt, resultQuestions, passed) => ({
  attemptId: String(attempt._id),
  quizType: attempt.quizType,
  score: attempt.score,
  totalQuestions: attempt.totalQuestions,
  percentage: attempt.percentage,
  timeTakenSec: attempt.timeTakenSec,
  passed,
  results: resultQuestions,
});

/**
 * Summary shape for GET /quiz/history — one list item. No answers[], no
 * submissionKey/sessionId/userId/guestId. `passed` is computed the same way
 * as toSubmitResponse (percentage >= PASS_PERCENTAGE), meaningful only for
 * chapter_gate — null otherwise, matching the submit response's contract.
 */
export const toHistoryListItem = (attempt) => ({
  attemptId: String(attempt._id),
  quizType: attempt.quizType,
  subjectId: attempt.subjectId,
  chapterId: attempt.chapterId,
  chapterIds: attempt.chapterIds,
  score: attempt.score,
  totalQuestions: attempt.totalQuestions,
  percentage: attempt.percentage,
  passed: attempt.quizType === 'chapter_gate' ? attempt.percentage >= PASS_PERCENTAGE : null,
  timeTakenSec: attempt.timeTakenSec,
  createdAt: attempt.createdAt,
});

export const toHistoryListResponse = (attempts, nextCursor, hasMore) => ({
  attempts: attempts.map(toHistoryListItem),
  nextCursor,
  hasMore,
});

/**
 * Full shape for GET /quiz/history/:attemptId — same top-level metadata as
 * toHistoryListItem plus the full `results[]` (options/explanation included,
 * built via toSubmitResultQuestion — same helper the submit response uses).
 */
export const toAttemptDetailResponse = (attempt, resultQuestions) => ({
  attemptId: String(attempt._id),
  quizType: attempt.quizType,
  subjectId: attempt.subjectId,
  chapterId: attempt.chapterId,
  chapterIds: attempt.chapterIds,
  score: attempt.score,
  totalQuestions: attempt.totalQuestions,
  percentage: attempt.percentage,
  passed: attempt.quizType === 'chapter_gate' ? attempt.percentage >= PASS_PERCENTAGE : null,
  timeTakenSec: attempt.timeTakenSec,
  createdAt: attempt.createdAt,
  results: resultQuestions,
});
