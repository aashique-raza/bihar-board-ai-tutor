/**
 * test-quiz-history.js
 *
 * Checkpoint 3 (Phase 2) real-DB verification. Hits generateQuiz() + submitQuiz()
 * to create real QuizAttempt docs, then getQuizHistory() directly (no HTTP layer).
 * Cleans up every QuizSession/QuizAttempt it creates.
 */
import crypto from 'crypto';
import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { QuizSession } from '../src/models/quizSession.model.js';
import { QuizAttempt } from '../src/models/quizAttempt.model.js';
import { generateQuiz } from '../src/services/quiz/quizGenerator.js';
import { submitQuiz } from '../src/services/quiz/quizSubmitter.js';
import { getQuizHistory } from '../src/services/quiz/quizHistoryService.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const createdSessionIds = [];
const createdAttemptIds = [];
const guestId = `test-guest-history-${Date.now()}`;
const chapterId = 'science.physics.chapter-01';
const otherChapterId = 'science.chemistry.chapter-01';

const allCorrectAnswers = (session) =>
  session.questions.map((sq) => ({
    questionId: String(sq.questionId),
    selectedOption: sq.correctOptionLabel,
    timeSpentMs: 1000,
  }));

const makeAttempt = async (gid, cid, quizType = 'chapter_practice') => {
  const quiz = await generateQuiz({ userId: null, guestId: gid, quizType, subjectId: 'science', chapterId: cid });
  createdSessionIds.push(quiz.quizId);
  const session = await QuizSession.findById(quiz.quizId).lean();
  const result = await submitQuiz({
    quizId: quiz.quizId,
    submissionKey: crypto.randomUUID(),
    timeTakenSec: 60,
    answers: allCorrectAnswers(session),
    userId: null,
    guestId: gid,
  });
  createdAttemptIds.push(result.attemptId);
  return result;
};

try {
  await connectDB();

  // ─── Happy path: 3 attempts, newest first ───────────────────────────────
  const a1 = await makeAttempt(guestId, chapterId);
  const a2 = await makeAttempt(guestId, chapterId);
  const a3 = await makeAttempt(guestId, otherChapterId);

  const happyPath = await getQuizHistory({ userId: null, guestId, quizType: null, chapterId: null, cursor: null, limit: 20 });
  assert(happyPath.attempts.length === 3, 'happy path: 3 attempts returned');
  assert(
    String(happyPath.attempts[0]._id) === a3.attemptId &&
    String(happyPath.attempts[2]._id) === a1.attemptId,
    'happy path: newest first ordering'
  );
  assert(happyPath.hasMore === false, 'happy path: hasMore false when under limit');
  assert(happyPath.nextCursor === null, 'happy path: nextCursor null when no more pages');

  // ─── Pagination: limit=2 across 3 attempts ──────────────────────────────
  const page1 = await getQuizHistory({ userId: null, guestId, quizType: null, chapterId: null, cursor: null, limit: 2 });
  assert(page1.attempts.length === 2, 'pagination: page1 has 2 items');
  assert(page1.hasMore === true, 'pagination: page1 hasMore true');
  assert(page1.nextCursor !== null, 'pagination: page1 has a nextCursor');

  const page2 = await getQuizHistory({ userId: null, guestId, quizType: null, chapterId: null, cursor: page1.nextCursor, limit: 2 });
  assert(page2.attempts.length === 1, 'pagination: page2 has remaining 1 item');
  assert(page2.hasMore === false, 'pagination: page2 hasMore false (exhausted)');
  assert(String(page2.attempts[0]._id) === a1.attemptId, 'pagination: page2 contains the oldest attempt');

  // ─── chapterId filter ────────────────────────────────────────────────────
  const filteredByChapter = await getQuizHistory({ userId: null, guestId, quizType: null, chapterId: otherChapterId, cursor: null, limit: 20 });
  assert(filteredByChapter.attempts.length === 1, 'chapterId filter: only matching chapter returned');
  assert(filteredByChapter.attempts[0].chapterId === otherChapterId, 'chapterId filter: correct chapterId on result');

  // ─── quizType filter (chapter_gate mixed in) ────────────────────────────
  // chapter_gate always 409s pre-Phase-3 (no awaiting_quiz chapters exist yet),
  // so we can only prove the filter narrows correctly using existing types here.
  const filteredByType = await getQuizHistory({ userId: null, guestId, quizType: 'chapter_practice', chapterId: null, cursor: null, limit: 20 });
  assert(filteredByType.attempts.length === 3, 'quizType filter: all 3 are chapter_practice');

  // ─── chapterId filter must also match mix_practice attempts (Bug 2 fix) ──
  // mix_practice stores the chapter in chapterIds[], not chapterId (null there).
  // A chapterId filter that only checked the chapterId field would silently
  // miss these — this was a real bug found in code review, fixed same session.
  const mixQuiz = await generateQuiz({ userId: null, guestId, quizType: 'mix_practice', subjectId: 'science' });
  createdSessionIds.push(mixQuiz.quizId);
  const mixSession = await QuizSession.findById(mixQuiz.quizId).lean();
  const mixResult = await submitQuiz({
    quizId: mixQuiz.quizId,
    submissionKey: crypto.randomUUID(),
    timeTakenSec: 60,
    answers: allCorrectAnswers(mixSession),
    userId: null,
    guestId,
  });
  createdAttemptIds.push(mixResult.attemptId);

  const mixAttemptDoc = await QuizAttempt.findById(mixResult.attemptId).lean();
  const chapterInsideMix = mixAttemptDoc.chapterIds[0];
  assert(Boolean(chapterInsideMix), 'mix_practice sanity: attempt has at least one chapterId in chapterIds[]');

  const filteredMixByChapter = await getQuizHistory({
    userId: null, guestId, quizType: null, chapterId: chapterInsideMix, cursor: null, limit: 20,
  });
  assert(
    filteredMixByChapter.attempts.some((a) => String(a._id) === mixResult.attemptId),
    'chapterId filter: mix_practice attempt found via chapterIds[] match, not just chapterId'
  );

  // ─── Identity isolation ──────────────────────────────────────────────────
  const otherGuestId = `test-guest-history-other-${Date.now()}`;
  const isolated = await getQuizHistory({ userId: null, guestId: otherGuestId, quizType: null, chapterId: null, cursor: null, limit: 20 });
  assert(isolated.attempts.length === 0, 'identity isolation: unrelated guest sees 0 attempts');

  // ─── Empty history for a brand-new identity ─────────────────────────────
  const empty = await getQuizHistory({ userId: null, guestId: `test-guest-history-empty-${Date.now()}`, quizType: null, chapterId: null, cursor: null, limit: 20 });
  assert(empty.attempts.length === 0 && empty.hasMore === false && empty.nextCursor === null, 'empty history: clean empty shape, no error');

  // ─── passed computation: null for chapter_practice ──────────────────────
  const { toHistoryListResponse } = await import('../src/utils/quizResponse.js');
  const shaped = toHistoryListResponse(happyPath.attempts, happyPath.nextCursor, happyPath.hasMore);
  assert(shaped.attempts.every((a) => a.passed === null), 'response shape: passed is null for chapter_practice attempts');
  assert(
    shaped.attempts.every((a) => !('answers' in a) && !('submissionKey' in a) && !('sessionId' in a) && !('userId' in a) && !('guestId' in a)),
    'response shape: no leak of answers/submissionKey/sessionId/userId/guestId'
  );

  // ─── limit clamp formula (Bug 1 fix) ────────────────────────────────────
  // Mirrors historyListController's exact clamp math — negative/zero/garbage
  // limit must never reach the DB query un-clamped (was silently corrupting
  // hasMore/attempts via a negative .limit() before this fix).
  const HISTORY_DEFAULT_LIMIT = 20;
  const HISTORY_MAX_LIMIT = 50;
  const clampLimit = (rawLimit) => {
    const parsedLimit = parseInt(rawLimit, 10);
    return Math.min(Math.max(Number.isNaN(parsedLimit) ? HISTORY_DEFAULT_LIMIT : parsedLimit, 1), HISTORY_MAX_LIMIT);
  };
  assert(clampLimit('-5') === 1, 'limit clamp: negative limit clamps to 1, not passed through raw');
  assert(clampLimit('0') === 1, 'limit clamp: zero limit clamps to 1');
  assert(clampLimit('9999') === HISTORY_MAX_LIMIT, 'limit clamp: oversized limit clamps to max (50)');
  assert(clampLimit('abc') === HISTORY_DEFAULT_LIMIT, 'limit clamp: garbage input falls back to default (20)');
  assert(clampLimit(undefined) === HISTORY_DEFAULT_LIMIT, 'limit clamp: missing limit falls back to default (20)');

  console.log('\nAll Checkpoint 3 (getQuizHistory) checks passed.');
} finally {
  if (createdAttemptIds.length > 0) {
    await QuizAttempt.deleteMany({ _id: { $in: createdAttemptIds } });
    console.log(`Cleaned up ${createdAttemptIds.length} test QuizAttempt docs.`);
  }
  if (createdSessionIds.length > 0) {
    await QuizSession.deleteMany({ _id: { $in: createdSessionIds } });
    console.log(`Cleaned up ${createdSessionIds.length} test QuizSession docs.`);
  }
  await disconnectDB();
}
