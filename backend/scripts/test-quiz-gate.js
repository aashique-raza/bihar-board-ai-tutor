/**
 * test-quiz-gate.js
 *
 * Phase 3 real-DB verification. Exercises the full chapter-gate flow:
 * step7's setChapterAwaitingQuiz(), generateQuiz(chapter_gate)'s awaiting_quiz
 * gate check, submitQuiz's handleGateQuizResult() -> ChapterProgress writes,
 * the claimGuestData() quiz-field merge, and the summary/recommendation fixes
 * in chapterProgress.controller.js.
 *
 * Cleans up every ChapterProgress/QuizSession/QuizAttempt doc it creates.
 */
import crypto from 'crypto';
import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChapterProgress } from '../src/models/chapterProgress.model.js';
import { QuizSession } from '../src/models/quizSession.model.js';
import { QuizAttempt } from '../src/models/quizAttempt.model.js';
import {
  setChapterAwaitingQuiz,
  recordGateQuizResult,
  claimGuestData,
  listUserChapterProgress,
} from '../src/services/chapterProgress.service.js';
import { generateQuiz } from '../src/services/quiz/quizGenerator.js';
import { submitQuiz } from '../src/services/quiz/quizSubmitter.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

const createdChapterProgressIds = [];
const createdSessionIds = [];
const createdAttemptIds = [];
const suffix = Date.now();
const guestId = `test-guest-gate-${suffix}`;
const claimUserId = `test-user-gate-claim-${suffix}`;
const chapterId = 'science.physics.chapter-01';
const subjectId = 'science';

const allCorrect = (session) =>
  session.questions.map((sq) => ({ questionId: String(sq.questionId), selectedOption: sq.correctOptionLabel, timeSpentMs: 1000 }));
const wrongLabel = (correct) => ['A', 'B', 'C', 'D'].find((l) => l !== correct);
const allWrong = (session) =>
  session.questions.map((sq) => ({ questionId: String(sq.questionId), selectedOption: wrongLabel(sq.correctOptionLabel), timeSpentMs: 1000 }));

try {
  await connectDB();

  // ─── Setup: in_progress -> awaiting_quiz ─────────────────────────────────
  const seedDoc = await ChapterProgress.create({
    guestId, chapterId, subjectId, status: 'in_progress', progressPercent: 100,
  });
  createdChapterProgressIds.push(seedDoc._id);

  const awaitingDoc = await setChapterAwaitingQuiz(null, guestId, chapterId);
  assert(awaitingDoc.status === 'awaiting_quiz', 'setChapterAwaitingQuiz: in_progress -> awaiting_quiz');
  assert(awaitingDoc.quizGateAttempts === 0, 'setChapterAwaitingQuiz: quizGateAttempts starts at 0');

  const reTriggered = await setChapterAwaitingQuiz(null, guestId, chapterId);
  assert(reTriggered.status === 'awaiting_quiz', 're-trigger guard: already-awaiting_quiz call is a no-op');

  // ─── Gate check: generateQuiz(chapter_gate) now succeeds ─────────────────
  const quiz1 = await generateQuiz({ userId: null, guestId, quizType: 'chapter_gate', subjectId, chapterId });
  createdSessionIds.push(quiz1.quizId);
  assert(quiz1.questions.length > 0, 'generateQuiz(chapter_gate): succeeds once chapter is awaiting_quiz');

  // ─── Pass path: all-correct -> completed ─────────────────────────────────
  const session1 = await QuizSession.findById(quiz1.quizId).lean();
  const passResult = await submitQuiz({
    quizId: quiz1.quizId, submissionKey: crypto.randomUUID(), timeTakenSec: 60,
    answers: allCorrect(session1), userId: null, guestId,
  });
  createdAttemptIds.push(passResult.attemptId);

  assert(passResult.passed === true, 'gate pass: all-correct submit returns passed=true');
  const afterPass = await ChapterProgress.findOne({ guestId, chapterId }).lean();
  assert(afterPass.status === 'completed', 'gate pass: ChapterProgress status -> completed');
  assert(afterPass.quizGateBestScore === 100, 'gate pass: quizGateBestScore = 100');
  assert(afterPass.quizGateAttempts === 1, 'gate pass: quizGateAttempts = 1');
  assert(afterPass.completedAt != null, 'gate pass: completedAt is set');
  assert(String(afterPass.lastQuizAttemptId) === passResult.attemptId, 'gate pass: lastQuizAttemptId points to this attempt');

  // ─── Fail path: reset to awaiting_quiz, all-wrong -> stays awaiting_quiz ──
  await ChapterProgress.updateOne({ guestId, chapterId }, { $set: { status: 'awaiting_quiz', completedAt: null } });
  const quiz2 = await generateQuiz({ userId: null, guestId, quizType: 'chapter_gate', subjectId, chapterId });
  createdSessionIds.push(quiz2.quizId);
  const session2 = await QuizSession.findById(quiz2.quizId).lean();
  const failResult = await submitQuiz({
    quizId: quiz2.quizId, submissionKey: crypto.randomUUID(), timeTakenSec: 60,
    answers: allWrong(session2), userId: null, guestId,
  });
  createdAttemptIds.push(failResult.attemptId);

  assert(failResult.passed === false, 'gate fail: all-wrong submit returns passed=false');
  const afterFail = await ChapterProgress.findOne({ guestId, chapterId }).lean();
  assert(afterFail.status === 'awaiting_quiz', 'gate fail: status stays awaiting_quiz (unlimited retries)');
  assert(afterFail.quizGateAttempts === 2, 'gate fail: quizGateAttempts = 2');
  assert(afterFail.quizGateBestScore === 100, 'gate fail: best score never lowered by a worse later attempt');

  // ─── chapter_practice must never touch ChapterProgress ───────────────────
  const practiceQuiz = await generateQuiz({ userId: null, guestId, quizType: 'chapter_practice', subjectId, chapterId });
  createdSessionIds.push(practiceQuiz.quizId);
  const practiceSession = await QuizSession.findById(practiceQuiz.quizId).lean();
  const beforePractice = await ChapterProgress.findOne({ guestId, chapterId }).lean();
  const practiceResult = await submitQuiz({
    quizId: practiceQuiz.quizId, submissionKey: crypto.randomUUID(), timeTakenSec: 30,
    answers: allCorrect(practiceSession), userId: null, guestId,
  });
  createdAttemptIds.push(practiceResult.attemptId);
  assert(practiceResult.passed === null, 'chapter_practice: passed is null (no gate)');
  const afterPractice = await ChapterProgress.findOne({ guestId, chapterId }).lean();
  assert(afterPractice.quizGateAttempts === beforePractice.quizGateAttempts, 'chapter_practice: quizGateAttempts unchanged');
  assert(afterPractice.status === beforePractice.status, 'chapter_practice: status unchanged');

  // ─── generate 409 guard: non-awaiting_quiz chapter rejects chapter_gate ──
  const otherChapterId = 'science.physics.chapter-02';
  const inProgressDoc = await ChapterProgress.create({
    guestId, chapterId: otherChapterId, subjectId, status: 'in_progress', progressPercent: 50,
  });
  createdChapterProgressIds.push(inProgressDoc._id);
  let gateBlockedError = null;
  try {
    await generateQuiz({ userId: null, guestId, quizType: 'chapter_gate', subjectId, chapterId: otherChapterId });
  } catch (err) {
    gateBlockedError = err;
  }
  assert(gateBlockedError?.statusCode === 409, 'generate: chapter_gate on non-awaiting_quiz chapter -> 409');

  // ─── Summary counts: awaiting_quiz counts alongside in_progress ──────────
  const summaryDocs = await listUserChapterProgress(null, guestId, { limit: 50 });
  const inProgressCount = summaryDocs.filter((d) => d.status === 'in_progress' || d.status === 'awaiting_quiz').length;
  assert(inProgressCount === 2, 'summary logic: awaiting_quiz chapter + in_progress chapter both count as inProgress (2)');

  // ─── claimGuestData: quiz fields merge on conflict ───────────────────────
  // Existing userId doc on the SAME chapter, with its own (lower) quiz history —
  // forces the merge branch, not the plain-reassign branch.
  const existingUserDoc = await ChapterProgress.create({
    userId: claimUserId, chapterId, subjectId, status: 'awaiting_quiz', progressPercent: 100,
    quizGateBestScore: 40, quizGateAttempts: 3, completedTopicIds: ['t1'],
  });
  createdChapterProgressIds.push(existingUserDoc._id);

  const claimResult = await claimGuestData(claimUserId, guestId);
  assert(claimResult.chaptersMerged === 1, 'claimGuestData: chapter with both guest+user docs merges (not transfers)');
  assert(claimResult.quizAttemptsTransferred >= 2, 'claimGuestData: quiz attempts transferred (pass + fail attempts)');

  const mergedDoc = await ChapterProgress.findOne({ userId: claimUserId, chapterId }).lean();
  assert(mergedDoc.quizGateBestScore === 100, 'claimGuestData: quizGateBestScore = max(guest 100, user 40) = 100');
  assert(mergedDoc.quizGateAttempts === 5, 'claimGuestData: quizGateAttempts = sum(guest 2 + user 3) = 5');
  // lastQuizAttemptId tracks the MOST RECENT attempt on each side (recordGateQuizResult
  // sets it on every submit, pass or fail) — guest's most recent was the fail attempt.
  // Merge picks the higher-best-score side's lastQuizAttemptId as-is, not "the pass attempt".
  assert(String(mergedDoc.lastQuizAttemptId) === failResult.attemptId, 'claimGuestData: lastQuizAttemptId = guest side\'s own last attempt (guest has higher best score)');

  const guestDocGone = await ChapterProgress.findOne({ guestId, chapterId }).lean();
  assert(guestDocGone === null, 'claimGuestData: guest-side doc deleted after merge');

  const transferredAttempts = await QuizAttempt.find({ userId: claimUserId }).lean();
  assert(transferredAttempts.length >= 2, 'claimGuestData: QuizAttempt docs reassigned to userId, guestId cleared');
  assert(transferredAttempts.every((a) => a.guestId === null), 'claimGuestData: all transferred attempts have guestId=null');

  console.log('\nAll Phase 3 (quiz gate) checks passed.');
} finally {
  if (createdAttemptIds.length > 0) {
    await QuizAttempt.deleteMany({ _id: { $in: createdAttemptIds } });
    console.log(`Cleaned up ${createdAttemptIds.length} test QuizAttempt docs.`);
  }
  if (createdSessionIds.length > 0) {
    await QuizSession.deleteMany({ _id: { $in: createdSessionIds } });
    console.log(`Cleaned up ${createdSessionIds.length} test QuizSession docs.`);
  }
  await ChapterProgress.deleteMany({ guestId });
  await ChapterProgress.deleteMany({ userId: claimUserId });
  console.log('Cleaned up test ChapterProgress docs.');
  await disconnectDB();
}
