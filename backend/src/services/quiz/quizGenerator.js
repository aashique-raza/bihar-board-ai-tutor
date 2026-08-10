/**
 * quizGenerator.js
 *
 * Orchestrates POST /api/v1/quiz/generate: validates chapter/gate state,
 * picks questions (questionSelector.js), shuffles their options
 * (optionShuffler.js), persists a QuizSession, and returns the client-safe
 * response (quizResponse.js).
 */

import { Question }         from '../../models/question.model.js';
import { QuizSession }      from '../../models/quizSession.model.js';
import { ChapterProgress }  from '../../models/chapterProgress.model.js';
import { findChapterById }     from '../../curriculum/chapterResolver.js';
import { loadCurriculumIndex } from '../../curriculum/curriculumIndexLoader.js';
import ApiError from '../../utils/ApiError.js';
import { toClientQuestion } from '../../utils/quizResponse.js';
import { QUESTION_COUNTS, SESSION_TTL_MIN } from '../../constants/quizConstants.js';
import { getSeenQuestionIds, selectChapterQuestionIds, selectMixQuestionIds } from './questionSelector.js';
import { shuffle, shuffleOptions, isQuestionUsable } from './optionShuffler.js';

const buildIdentityFilter = (userId, guestId) => (userId ? { userId } : { guestId });

/**
 * Resolves and validates the chapter for chapter_gate / chapter_practice.
 * mix_practice never reaches here — chapterId is ignored for it.
 */
const resolveChapter = async (chapterId, quizType, userId, guestId) => {
  const index = await loadCurriculumIndex();
  const chapter = findChapterById(index, chapterId);
  if (!chapter) throw new ApiError(404, `Chapter '${chapterId}' not found.`);

  if (quizType === 'chapter_gate') {
    const progress = await ChapterProgress.findOne(
      { ...buildIdentityFilter(userId, guestId), chapterId: chapter.chapterId },
      { status: 1 }
    ).lean();

    // Until Phase 3 ships the 'awaiting_quiz' status, this branch always 409s —
    // expected and intentional (Checkpoint 1 plan, Decision Q1: Option A).
    if (progress?.status !== 'awaiting_quiz') {
      throw new ApiError(409, 'Chapter is not awaiting a gate quiz yet.');
    }
  }

  return chapter.chapterId;
};

export const generateQuiz = async ({ userId, guestId, quizType, subjectId, chapterId }) => {
  let resolvedChapterId = null;
  let chapterIds = [];

  if (quizType !== 'mix_practice') {
    resolvedChapterId = await resolveChapter(chapterId, quizType, userId, guestId);
  }

  const seenSet = await getSeenQuestionIds(userId, guestId);
  const targetCount = QUESTION_COUNTS[quizType];

  let questionIds;
  if (quizType === 'mix_practice') {
    const result = await selectMixQuestionIds(subjectId, seenSet, targetCount);
    questionIds = result.questionIds;
    chapterIds = result.chapterIds;
  } else {
    const result = await selectChapterQuestionIds(subjectId, resolvedChapterId, seenSet, targetCount);
    questionIds = result.questionIds;
  }

  if (questionIds.length === 0) {
    throw new ApiError(404, 'No questions available for this quiz.');
  }

  // Full localized content fetched only for the questions actually selected —
  // never for the whole chapter/subject candidate pool.
  const questionDocs = await Question.find(
    { _id: { $in: questionIds } },
    { questionText: 1, options: 1, correctOptionLabel: 1, topicId: 1, version: 1, askedInYears: 1 }
  ).lean();
  // console.log('question before',questionDocs)
  const questionById = new Map(questionDocs.map((q) => [String(q._id), q]));

  const displayOrder = shuffle(questionIds);
  const servedQuestions = [];
  const clientQuestions = [];

  for (const id of displayOrder) {
    const question = questionById.get(id);
    // console.log('question before',question)
    if (!question || !isQuestionUsable(question)) {
      console.warn(`[Quiz] Skipping unusable question ${id} during generate.`);
      continue;
    }

    const { optionOrder, correctOptionLabel } = shuffleOptions(question);

    servedQuestions.push({
      questionId: question._id,
      questionVersion: question.version,
      optionOrder,
      correctOptionLabel,
      topicId: question.topicId,
    });
    // console.log('question',question)
    clientQuestions.push(toClientQuestion(question, optionOrder));
  }

  if (servedQuestions.length === 0) {
    throw new ApiError(404, 'No usable questions available for this quiz.');
  }

  const expiresAt = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000);

  const session = await QuizSession.create({
    userId: userId || null,
    guestId: guestId || null,
    quizType,
    subjectId,
    chapterId: resolvedChapterId,
    chapterIds,
    questions: servedQuestions,
    status: 'pending',
    expiresAt,
  });

  return {
    quizId: session._id,
    quizType,
    subjectId,
    chapterId: resolvedChapterId,
    chapterIds,
    questionCount: clientQuestions.length,
    expectedCount: targetCount,
    isPartial: clientQuestions.length < targetCount,
    expiresAt,
    questions: clientQuestions,
  };
};
