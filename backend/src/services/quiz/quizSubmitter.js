/**
 * quizSubmitter.js
 *
 * Orchestrates POST /api/v1/quiz/submit: idempotency check, atomic session
 * lock, server-side scoring against the SESSION's shuffled correctOptionLabel
 * (never Question.correctOptionLabel), attempt persistence, and the
 * client-safe result response (options rendered in the order the student
 * actually saw them, with explanations attached for the first time).
 */

import { Question }     from '../../models/question.model.js';
import { QuizSession }  from '../../models/quizSession.model.js';
import { QuizAttempt }  from '../../models/quizAttempt.model.js';
import ApiError from '../../utils/ApiError.js';
import { toSubmitResultQuestion, toSubmitResponse } from '../../utils/quizResponse.js';
import { PASS_PERCENTAGE, MAX_TIME_TAKEN_SEC } from '../../constants/quizConstants.js';

const buildIdentityFilter = (userId, guestId) => (userId ? { userId } : { guestId });

const clampTimeTakenSec = (value) => Math.max(0, Math.min(Number(value) || 0, MAX_TIME_TAKEN_SEC));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A concurrent request carrying the SAME submissionKey (double-click, network
// retry) can win the session lock a few milliseconds before this request
// checks — at that moment the session already reads 'submitted' but the
// winner's QuizAttempt.create() may not have committed yet. A short bounded
// poll closes that window so the loser gets the winner's real result (200)
// instead of an incorrect 409. Does not fully eliminate the race under
// extreme scheduling delay, but covers the realistic DB round-trip window.
const RACED_ATTEMPT_RETRIES = 4;
const RACED_ATTEMPT_RETRY_DELAY_MS = 75;

const findRacedAttempt = async (submissionKey, identityFilter) => {
  for (let attempt = 0; attempt < RACED_ATTEMPT_RETRIES; attempt++) {
    const found = await QuizAttempt.findOne({ submissionKey, ...identityFilter }).lean();
    if (found) return found;
    if (attempt < RACED_ATTEMPT_RETRIES - 1) await sleep(RACED_ATTEMPT_RETRY_DELAY_MS);
  }
  return null;
};

const fetchQuestionsById = async (questionIds) => {
  const docs = await Question.find(
    { _id: { $in: questionIds } },
    { questionText: 1, options: 1, explanation: 1 }
  ).lean();
  return new Map(docs.map((q) => [String(q._id), q]));
};

/**
 * Idempotent-replay path: submissionKey already scored an attempt. Returns
 * the SAME result rather than re-scoring — request retries and double-clicks
 * must never create a second attempt or change the stored outcome.
 *
 * The attempt itself does not store optionOrder (only the session does), so
 * this looks the original session back up to render results in the exact
 * order the student saw them. If that session has since TTL-expired, it
 * falls back to the question's default DB option order — score/isCorrect are
 * unaffected either way since those are already baked into the attempt.
 */
const buildResponseForExistingAttempt = async (attempt) => {
  const questionIds = attempt.answers.map((a) => a.questionId);
  const questionById = await fetchQuestionsById(questionIds);

  const session = await QuizSession.findById(attempt.sessionId, { questions: 1 }).lean();
  const sessionQuestionById = new Map(
    (session?.questions || []).map((sq) => [String(sq.questionId), sq])
  );

  const resultQuestions = attempt.answers.map((a) => {
    const question = questionById.get(String(a.questionId));
    const sessionQuestion = sessionQuestionById.get(String(a.questionId));
    const optionOrder = sessionQuestion?.optionOrder ?? question.options.map((o) => o.label);

    return toSubmitResultQuestion(
      { questionId: a.questionId, optionOrder, correctOptionLabel: a.correctOptionLabel },
      question,
      { selectedOption: a.selectedOption, isCorrect: a.isCorrect, timeSpentMs: a.timeSpentMs }
    );
  });

  const passed = attempt.quizType === 'chapter_gate' ? attempt.percentage >= PASS_PERCENTAGE : null;
  return toSubmitResponse(attempt, resultQuestions, passed);
};

export const submitQuiz = async ({ quizId, submissionKey, timeTakenSec, answers, userId, guestId }) => {
  const identityFilter = buildIdentityFilter(userId, guestId);

  // Fast path: this submissionKey was already scored (retry/double-click).
  const existing = await QuizAttempt.findOne({ submissionKey, ...identityFilter }).lean();
  if (existing) {
    return buildResponseForExistingAttempt(existing);
  }

  // Atomic lock: only one concurrent request can move a session pending -> submitted.
  const session = await QuizSession.findOneAndUpdate(
    { _id: quizId, ...identityFilter, status: 'pending' },
    { $set: { status: 'submitted' } },
    { returnDocument: 'before' }
  ).lean();

  if (!session) {
    // Distinguish "already submitted" (409) from "never existed / expired /
    // wrong identity" (404) — findOneAndUpdate returns null for both.
    const current = await QuizSession.findOne({ _id: quizId, ...identityFilter }, { status: 1 }).lean();
    if (current?.status === 'submitted') {
      // Could be a genuinely different (later) submission attempt, OR this
      // exact same submissionKey racing the request that just won the lock —
      // check before treating it as a real conflict.
      const raced = await findRacedAttempt(submissionKey, identityFilter);
      if (raced) return buildResponseForExistingAttempt(raced);
      throw new ApiError(409, 'Quiz already submitted.');
    }
    throw new ApiError(404, 'Quiz session not found or expired.');
  }

  const answersByQuestionId = new Map(answers.map((a) => [String(a.questionId), a]));

  const scoredAnswers = session.questions.map((sq) => {
    const submitted = answersByQuestionId.get(String(sq.questionId));
    const selectedOption = submitted?.selectedOption ?? null;
    return {
      questionId: sq.questionId,
      questionVersionSnapshot: sq.questionVersion,
      topicId: sq.topicId,
      selectedOption,
      correctOptionLabel: sq.correctOptionLabel,
      isCorrect: selectedOption === sq.correctOptionLabel,
      timeSpentMs: Math.max(0, Number(submitted?.timeSpentMs) || 0),
    };
  });

  const score = scoredAnswers.filter((a) => a.isCorrect).length;
  const percentage = Math.round((score / scoredAnswers.length) * 100);
  const passed = session.quizType === 'chapter_gate' ? percentage >= PASS_PERCENTAGE : null;

  let attempt;
  try {
    attempt = await QuizAttempt.create({
      userId,
      guestId,
      sessionId: session._id,
      submissionKey,
      quizType: session.quizType,
      subjectId: session.subjectId,
      chapterId: session.chapterId,
      chapterIds: session.chapterIds,
      totalQuestions: scoredAnswers.length,
      score,
      percentage,
      answers: scoredAnswers,
      timeTakenSec: clampTimeTakenSec(timeTakenSec),
    });
  } catch (error) {
    // E11000 on submissionKey's unique index = a concurrent identical retry
    // won the create() race between our idempotency check and this insert.
    // Not a real failure — return the winner's result instead of erroring.
    if (error.code === 11000) {
      const raced = await QuizAttempt.findOne({ submissionKey, ...identityFilter }).lean();
      if (raced) return buildResponseForExistingAttempt(raced);
    }
    throw error;
  }

  // Phase 3 will extend this branch with handleGateQuizResult() (ChapterProgress
  // awaiting_quiz -> completed on pass) — deliberately out of scope here.
  await QuizSession.updateOne({ _id: session._id }, { $set: { attemptId: attempt._id } });

  const questionById = await fetchQuestionsById(session.questions.map((sq) => sq.questionId));
  const resultQuestions = session.questions.map((sq) => {
    const question = questionById.get(String(sq.questionId));
    const scoredAnswer = scoredAnswers.find((a) => String(a.questionId) === String(sq.questionId));
    return toSubmitResultQuestion(sq, question, scoredAnswer);
  });

  return toSubmitResponse(attempt, resultQuestions, passed);
};
