/**
 * questionSelector.js
 *
 * Picks which questionIds go into a quiz. Deliberately returns IDs only —
 * full localized content is fetched once, later, for the final selected set
 * (Checkpoint 1 plan: candidate selection and content fetch are separate
 * queries so we never load full question text for questions we don't use).
 */

import { Question }    from '../../models/question.model.js';
import { QuizAttempt } from '../../models/quizAttempt.model.js';
import { shuffle }     from './optionShuffler.js';

const buildIdentityFilter = (userId, guestId) => (userId ? { userId } : { guestId });

/**
 * Every questionId this student has ever answered correctly, across ALL quiz
 * types — no chapterId filter (QUIZ_SYSTEM_BLUEPRINT.md §4 [AUDIT]: mix_practice
 * attempts store chapterId: null, so a chapter-scoped query would silently miss
 * them and vice versa). Aggregated server-side into one small doc instead of
 * loading every past attempt's full answers array into Node.
 */
export const getSeenQuestionIds = async (userId, guestId) => {
  if (!userId && !guestId) return new Set();

  const [result] = await QuizAttempt.aggregate([
    { $match: buildIdentityFilter(userId, guestId) },
    { $unwind: '$answers' },
    { $match: { 'answers.isCorrect': true } },
    { $group: { _id: null, ids: { $addToSet: '$answers.questionId' } } },
  ]);

  return new Set((result?.ids || []).map(String));
};

/**
 * Candidate questionIds for one chapter, unseen-first then seen (Layer 2),
 * both halves shuffled. `subjectId + chapterId + isActive` is index-covered —
 * projecting only `_id` means Mongo answers straight from the index, never
 * touching the documents.
 */
export const selectChapterQuestionIds = async (subjectId, chapterId, seenSet, count) => {
  const candidates = await Question.find(
    { subjectId, chapterId, isActive: true },
    { _id: 1 }
  ).lean();

  const ids = candidates.map((c) => String(c._id));
  const unseen = shuffle(ids.filter((id) => !seenSet.has(id)));
  const seen = shuffle(ids.filter((id) => seenSet.has(id)));

  return {
    questionIds: [...unseen, ...seen].slice(0, count),
    availableCount: ids.length,
  };
};

/**
 * Mix Quiz selection — balances across every chapter that has active questions
 * for this subject, so a Mix Quiz genuinely samples the whole subject instead
 * of being dominated by the biggest chapters (biology ch01 has 103 questions,
 * biology ch06 has 16 — QUIZ_BUILD_LOG.md §19).
 *
 * Every eligible chapter gets a baseline of 1 slot; remaining slots are handed
 * out proportional to each chapter's remaining question count, using
 * largest-remainder rounding so the total lands exactly on `targetCount`
 * (or on total availability, if the bank is thinner than that — isPartial
 * is computed by the caller from questionIds.length vs targetCount).
 */
export const selectMixQuestionIds = async (subjectId, seenSet, targetCount) => {
  const chapterCounts = await Question.aggregate([
    { $match: { subjectId, isActive: true } },
    { $group: { _id: '$chapterId', count: { $sum: 1 } } },
  ]);

  const eligible = chapterCounts.filter((c) => c.count > 0);
  const totalAvailable = eligible.reduce((sum, c) => sum + c.count, 0);
  if (totalAvailable === 0) return { questionIds: [], chapterIds: [], availableCount: 0 };

  const target = Math.min(targetCount, totalAvailable);

  // Current data always has fewer chapters (16) than the mix target (20), so a
  // baseline of 1 per chapter is always affordable. If that ever inverts (many
  // more chapters than the target), fall back to pure proportional quotas.
  const baseline = eligible.length <= target ? 1 : 0;
  const remaining = target - eligible.length * baseline;

  const extraCapacity = eligible.map((c) => ({
    chapterId: c._id,
    capacity: Math.max(c.count - baseline, 0),
  }));
  const totalExtraCapacity = extraCapacity.reduce((sum, c) => sum + c.capacity, 0);

  const quotas = extraCapacity.map((c) => {
    const share = totalExtraCapacity > 0 ? (c.capacity / totalExtraCapacity) * remaining : 0;
    return {
      chapterId: c.chapterId,
      capacity: c.capacity,
      quota: baseline + Math.floor(share),
      remainder: share - Math.floor(share),
    };
  });

  let allocated = quotas.reduce((sum, q) => sum + q.quota, 0);
  const byRemainder = [...quotas].sort((a, b) => b.remainder - a.remainder);
  for (const q of byRemainder) {
    if (allocated >= target) break;
    if (q.quota >= baseline + q.capacity) continue; // chapter has no more to give
    q.quota += 1;
    allocated += 1;
  }

  const questionIds = [];
  const chapterIds = [];
  for (const { chapterId, quota } of quotas) {
    if (quota <= 0) continue;
    const { questionIds: picked } = await selectChapterQuestionIds(subjectId, chapterId, seenSet, quota);
    if (picked.length > 0) {
      questionIds.push(...picked);
      chapterIds.push(chapterId);
    }
  }

  return { questionIds, chapterIds, availableCount: totalAvailable };
};
