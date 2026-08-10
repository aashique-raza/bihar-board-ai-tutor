/**
 * test-quiz-submit.js
 *
 * Checkpoint 2 (Phase 2) real-DB verification. Hits generateQuiz() + submitQuiz()
 * directly (no HTTP layer) against the live 743-question bank seeded in Phase 1.
 * Cleans up every QuizSession/QuizAttempt it creates.
 */
import crypto from 'crypto';
import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { QuizSession } from '../src/models/quizSession.model.js';
import { QuizAttempt } from '../src/models/quizAttempt.model.js';
import { generateQuiz } from '../src/services/quiz/quizGenerator.js';
import { submitQuiz } from '../src/services/quiz/quizSubmitter.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const createdSessionIds = [];
const createdAttemptIds = [];
const guestId = `test-guest-submit-${Date.now()}`;
const chapterId = 'science.physics.chapter-01';

const allCorrectAnswers = (session) =>
  session.questions.map((sq) => ({
    questionId: String(sq.questionId),
    selectedOption: sq.correctOptionLabel,
    timeSpentMs: 5000,
  }));

const wrongLabel = (correct) => ['A', 'B', 'C', 'D'].find((label) => label !== correct);

try {
  await connectDB();

  // ─── Happy path: chapter_practice, all correct ──────────────────────────
  const quiz = await generateQuiz({ userId: null, guestId, quizType: 'chapter_practice', subjectId: 'science', chapterId });
  createdSessionIds.push(quiz.quizId);
  const session = await QuizSession.findById(quiz.quizId).lean();

  const submissionKey1 = crypto.randomUUID();
  const result1 = await submitQuiz({
    quizId: quiz.quizId,
    submissionKey: submissionKey1,
    timeTakenSec: 120,
    answers: allCorrectAnswers(session),
    userId: null,
    guestId,
  });
  createdAttemptIds.push(result1.attemptId);

  assert(result1.score === 10, 'happy path: all-correct submission scores 10/10');
  assert(result1.percentage === 100, 'happy path: percentage is 100');
  assert(result1.totalQuestions === 10, 'happy path: totalQuestions is 10');
  assert(result1.passed === null, 'happy path: passed is null for chapter_practice (not gate)');
  assert(result1.results.length === 10, 'happy path: results array has 10 entries');
  assert(
    result1.results.every((r) => r.text?.hinglish !== undefined && r.explanation !== undefined),
    'happy path: every result carries text + explanation'
  );
  assert(
    result1.results.every((r) => r.isCorrect === true),
    'happy path: every result marked correct'
  );

  const sampleServed = session.questions[0];
  const sampleResult = result1.results.find((r) => r.questionId === String(sampleServed.questionId));
  assert(
    JSON.stringify(sampleResult.options.map((o) => o.label)) === JSON.stringify(['A', 'B', 'C', 'D']),
    'happy path: result options re-labeled A-D in served (shuffled) order'
  );

  // ─── Idempotency: same submissionKey again → same attemptId, no duplicate ─
  const result1Again = await submitQuiz({
    quizId: quiz.quizId,
    submissionKey: submissionKey1,
    timeTakenSec: 999, // deliberately different — must be ignored, original wins
    answers: [],
    userId: null,
    guestId,
  });
  assert(result1Again.attemptId === result1.attemptId, 'idempotency: same submissionKey returns same attemptId');
  assert(result1Again.timeTakenSec === 120, 'idempotency: original timeTakenSec preserved, replay value ignored');

  const attemptCount = await QuizAttempt.countDocuments({ sessionId: quiz.quizId });
  assert(attemptCount === 1, 'idempotency: exactly one QuizAttempt exists for this session');

  // ─── Resubmit with a NEW submissionKey on an already-submitted session → 409
  try {
    await submitQuiz({
      quizId: quiz.quizId,
      submissionKey: crypto.randomUUID(),
      timeTakenSec: 60,
      answers: [],
      userId: null,
      guestId,
    });
    throw new Error('FAIL: resubmitting a submitted session should have thrown 409');
  } catch (error) {
    assert(error.statusCode === 409, 'resubmit with new key on submitted session: 409');
  }

  // ─── Wrong identity submitting someone else's quizId → 404 ─────────────
  try {
    await submitQuiz({
      quizId: quiz.quizId,
      submissionKey: crypto.randomUUID(),
      timeTakenSec: 60,
      answers: [],
      userId: null,
      guestId: `other-guest-${Date.now()}`,
    });
    throw new Error('FAIL: wrong identity should have thrown 404');
  } catch (error) {
    assert(error.statusCode === 404, "wrong identity on someone else's quizId: 404");
  }

  // ─── Fake quizId → 404 ───────────────────────────────────────────────────
  try {
    await submitQuiz({
      quizId: '507f1f77bcf86cd799439011',
      submissionKey: crypto.randomUUID(),
      timeTakenSec: 60,
      answers: [],
      userId: null,
      guestId,
    });
    throw new Error('FAIL: fake quizId should have thrown 404');
  } catch (error) {
    assert(error.statusCode === 404, 'fake quizId: 404');
  }

  // ─── Partial score: mix correct + wrong + skipped ───────────────────────
  const quiz2 = await generateQuiz({ userId: null, guestId, quizType: 'chapter_practice', subjectId: 'science', chapterId });
  createdSessionIds.push(quiz2.quizId);
  const session2 = await QuizSession.findById(quiz2.quizId).lean();

  const mixedAnswers = session2.questions.map((sq, i) => {
    if (i % 3 === 0) return { questionId: String(sq.questionId), selectedOption: null, timeSpentMs: 0 }; // skipped
    if (i % 3 === 1) return { questionId: String(sq.questionId), selectedOption: wrongLabel(sq.correctOptionLabel), timeSpentMs: 3000 }; // wrong
    return { questionId: String(sq.questionId), selectedOption: sq.correctOptionLabel, timeSpentMs: 3000 }; // correct
  });
  const expectedCorrect = mixedAnswers.filter((_, i) => i % 3 === 2).length;

  const result2 = await submitQuiz({
    quizId: quiz2.quizId,
    submissionKey: crypto.randomUUID(),
    timeTakenSec: 200,
    answers: mixedAnswers,
    userId: null,
    guestId,
  });
  createdAttemptIds.push(result2.attemptId);

  assert(result2.score === expectedCorrect, `partial score: expected ${expectedCorrect} correct, got ${result2.score}`);
  assert(
    result2.results.some((r) => r.selectedOption === null && r.isCorrect === false),
    'partial score: skipped question recorded as selectedOption null, isCorrect false'
  );

  // ─── timeTakenSec clamp: absurd value gets clamped, never crashes ────────
  const quiz3 = await generateQuiz({ userId: null, guestId, quizType: 'chapter_practice', subjectId: 'science', chapterId });
  createdSessionIds.push(quiz3.quizId);
  const result3 = await submitQuiz({
    quizId: quiz3.quizId,
    submissionKey: crypto.randomUUID(),
    timeTakenSec: 999999999,
    answers: [],
    userId: null,
    guestId,
  });
  createdAttemptIds.push(result3.attemptId);
  assert(result3.timeTakenSec === 3 * 60 * 60, 'timeTakenSec: absurd value clamped to 3-hour max');

  console.log('\nAll Checkpoint 2 (submitQuiz) checks passed.');
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
