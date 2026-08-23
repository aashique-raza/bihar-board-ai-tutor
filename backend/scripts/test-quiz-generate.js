/**
 * test-quiz-generate.js
 *
 * Checkpoint 1 (Phase 2) real-DB verification. Hits generateQuiz() directly
 * (no HTTP layer) against the live 743-question bank seeded in Phase 1.
 * Cleans up every QuizSession it creates.
 */
import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { QuizSession } from '../src/models/quizSession.model.js';
import { Question } from '../src/models/question.model.js';
import { generateQuiz } from '../src/services/quiz/quizGenerator.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const FORBIDDEN_KEYS = ['correctOptionLabel', 'explanation', 'topicId', 'optionOrder', '_id'];
const assertNoForbiddenKeys = (quiz, label) => {
  const serialized = JSON.stringify(quiz);
  for (const key of FORBIDDEN_KEYS) {
    assert(!serialized.includes(`"${key}"`), `${label}: response never contains "${key}"`);
  }
};

const createdSessionIds = [];
const guestId = `test-guest-${Date.now()}`;

try {
  await connectDB();

  // ─── chapter_practice: happy path ───────────────────────────────────────
  const chapterId = 'science.physics.chapter-01';
  const practiceQuiz = await generateQuiz({
    userId: null,
    guestId,
    quizType: 'chapter_practice',
    subjectId: 'science',
    chapterId,
  });
  createdSessionIds.push(practiceQuiz.quizId);

  assert(practiceQuiz.questionCount === 10, 'chapter_practice: 10 questions returned');
  assert(practiceQuiz.questions.length === 10, 'chapter_practice: questions array length matches');
  assert(
    practiceQuiz.questions.every((q) => q.text?.en !== undefined && q.text?.hi !== undefined && q.text?.hinglish !== undefined),
    'chapter_practice: every question.text carries en/hi/hinglish keys'
  );
  assert(
    practiceQuiz.questions.every((q) => q.options.length === 4 && q.options.every((o) => o.text?.hinglish !== undefined)),
    'chapter_practice: every option carries localized text'
  );
  assertNoForbiddenKeys(practiceQuiz, 'chapter_practice');

  // ─── Shuffle proof: run it twice, expect at least one different order ──
  const practiceQuiz2 = await generateQuiz({
    userId: null,
    guestId,
    quizType: 'chapter_practice',
    subjectId: 'science',
    chapterId,
  });
  createdSessionIds.push(practiceQuiz2.quizId);

  const session1 = await QuizSession.findById(practiceQuiz.quizId).lean();
  const session2 = await QuizSession.findById(practiceQuiz2.quizId).lean();
  const sameOrderCount = session1.questions.filter((sq1) => {
    const sq2 = session2.questions.find((q) => String(q.questionId) === String(sq1.questionId));
    return sq2 && JSON.stringify(sq1.optionOrder) === JSON.stringify(sq2.optionOrder);
  }).length;
  assert(
    sameOrderCount < session1.questions.length,
    'shuffle: repeated generate produces at least one different option order'
  );

  // ─── Shuffle correctness: DB's correctOptionLabel really maps to the ────
  // original DB-correct option (positions differ, underlying text is the same).
  const sample = session1.questions[0];
  const originalQuestion = await Question.findById(sample.questionId).lean();
  const displayIndexOfCorrect = sample.optionOrder.indexOf(originalQuestion.correctOptionLabel);
  const DISPLAY_LABELS = ['A', 'B', 'C', 'D'];
  assert(
    DISPLAY_LABELS[displayIndexOfCorrect] === sample.correctOptionLabel,
    'shuffle correctness: session correctOptionLabel points at the DB-original correct option'
  );

  // ─── mix_practice: happy path ────────────────────────────────────────────
  const mixQuiz = await generateQuiz({
    userId: null,
    guestId,
    quizType: 'mix_practice',
    subjectId: 'science',
    chapterId: null,
  });
  createdSessionIds.push(mixQuiz.quizId);

  assert(mixQuiz.questionCount === 20, 'mix_practice: 20 questions returned');
  assert(mixQuiz.chapterIds.length > 1, 'mix_practice: spans more than one chapter');
  assert(!mixQuiz.chapterIds.includes('science.meta.chapter-00'), 'mix_practice: excludes unseeded meta chapter');
  assertNoForbiddenKeys(mixQuiz, 'mix_practice');

  // ─── chapter_gate: not awaiting_quiz yet → 409 (expected until Phase 3) ─
  try {
    await generateQuiz({
      userId: null,
      guestId,
      quizType: 'chapter_gate',
      subjectId: 'science',
      chapterId,
    });
    throw new Error('FAIL: chapter_gate should have thrown 409');
  } catch (error) {
    assert(error.statusCode === 409, 'chapter_gate: 409 when chapter is not awaiting_quiz');
  }

  // ─── Bad chapterId → 404 ─────────────────────────────────────────────────
  try {
    await generateQuiz({
      userId: null,
      guestId,
      quizType: 'chapter_practice',
      subjectId: 'science',
      chapterId: 'science.physics.chapter-99',
    });
    throw new Error('FAIL: fake chapterId should have thrown 404');
  } catch (error) {
    assert(error.statusCode === 404, 'fake chapterId: 404');
  }

  // ─── Unseeded chapter (meta) → 404 ───────────────────────────────────────
  try {
    await generateQuiz({
      userId: null,
      guestId,
      quizType: 'chapter_practice',
      subjectId: 'science',
      chapterId: 'science.meta.chapter-00',
    });
    throw new Error('FAIL: meta chapter should have thrown 404');
  } catch (error) {
    assert(error.statusCode === 404, 'meta chapter (0 seeded questions): 404');
  }

  console.log('\nAll Checkpoint 1 (generateQuiz) checks passed.');
} finally {
  if (createdSessionIds.length > 0) {
    await QuizSession.deleteMany({ _id: { $in: createdSessionIds } });
    console.log(`Cleaned up ${createdSessionIds.length} test QuizSession docs.`);
  }
  await disconnectDB();
}
