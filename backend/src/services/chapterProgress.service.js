/**
 * chapterProgress.service.js
 *
 * Cross-session chapter progress persistence layer.
 * One document per (user × chapter) in the chapter_progress collection.
 *
 * Redis cache: 60s TTL, invalidated on every write.
 * All write operations use atomic MongoDB operators ($set, $addToSet, $inc, $setOnInsert)
 * to be safe under concurrent tabs / multi-device use.
 */

import { ChapterProgress } from '../models/chapterProgress.model.js';
import { StudyEvent }      from '../models/studyEvent.model.js';
import redis               from '../config/redisClient.js';
import { loadCurriculumIndex } from '../curriculum/curriculumIndexLoader.js';
import { getChapterCoreTopics } from '../curriculum/topicResolver.js';

const isDev = process.env.NODE_ENV !== 'production';
const CACHE_TTL_SEC = 60; // invalidated on every write; 60s max staleness

// ─── Cache key builders ──────────────────────────────────────────────────────

const scopeKey      = (userId, guestId) => userId || guestId || 'anon';
const progressKey   = (userId, guestId, chapterId) => `cp:${scopeKey(userId, guestId)}:${chapterId}`;
const listKey       = (userId, guestId) => `cp_list:${scopeKey(userId, guestId)}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the number of core topics for a chapter — used to compute progressPercent. */
const fetchTotalCoreTopics = async (chapterId) => {
  try {
    const index = await loadCurriculumIndex();
    const topics = getChapterCoreTopics(index, chapterId);
    return topics.length;
  } catch {
    return 0; // non-critical — progressPercent will show 0 until index is readable
  }
};

/** Build the MongoDB filter for user or guest. */
const buildFilter = (userId, guestId, chapterId) =>
  userId
    ? { userId, chapterId }
    : { guestId, chapterId };

/** Safely read from Redis. Returns null on any error. */
const redisGet = async (key) => {
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Safely write to Redis. Fails silently — cache is optional. */
const redisSetex = async (key, ttl, value) => {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch { /* non-critical */ }
};

/** Invalidate all cache keys related to a user+chapter write. */
const invalidateCache = async (userId, guestId, chapterId) => {
  try {
    await redis.del(
      progressKey(userId, guestId, chapterId),
      listKey(userId, guestId)
    );
  } catch { /* non-critical */ }
};

// ─── READ ────────────────────────────────────────────────────────────────────

/**
 * Get cross-session chapter progress for one chapter.
 * Returns null if the student has never studied this chapter.
 * Cached in Redis for 60s.
 */
export const getChapterProgress = async (userId, guestId, chapterId) => {
  if (!chapterId) return null;

  const cacheKey = progressKey(userId, guestId, chapterId);
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  const doc = await ChapterProgress.findOne(buildFilter(userId, guestId, chapterId)).lean();

  if (doc) await redisSetex(cacheKey, CACHE_TTL_SEC, doc);

  return doc; // null = not started
};

/**
 * List a user's chapter progress records, sorted by recency.
 * Used by FocusModal "Continue" section.
 */
export const listUserChapterProgress = async (userId, guestId, { status, limit = 10 } = {}) => {
  if (!userId && !guestId) return [];

  const query = userId ? { userId } : { guestId };
  if (status) query.status = status;

  return ChapterProgress
    .find(query)
    .sort({ lastStudiedAt: -1 })
    .limit(limit)
    .lean();
};

// ─── WRITE ───────────────────────────────────────────────────────────────────

/**
 * Upsert chapter progress — creates on first /ask, updates on subsequent.
 * Called from step7 on every focus-mode /ask response.
 *
 * @param {string|null} userId
 * @param {string|null} guestId
 * @param {string}      chapterId
 * @param {object}      updates   — fields from step7: currentTopicId, completedTopicIds, etc.
 * @returns {object}    Updated chapter_progress document
 */
export const upsertChapterProgress = async (userId, guestId, chapterId, updates = {}) => {
  if (!chapterId) return null;

  const filter = buildFilter(userId, guestId, chapterId);

  // Get totalCoreTopics: prefer from updates, else from DB, else from curriculum-index
  let totalCoreTopics = updates.totalCoreTopics;
  if (!totalCoreTopics) {
    const existing = await ChapterProgress.findOne(filter, { totalCoreTopics: 1 }).lean();
    totalCoreTopics = existing?.totalCoreTopics || 0;
  }
  if (!totalCoreTopics) {
    totalCoreTopics = await fetchTotalCoreTopics(chapterId);
  }

  // Compute updated progress percent
  // completedTopicIds in $addToSet will be applied by Mongo — we approximate here
  const existingCompleted = await ChapterProgress.findOne(filter, { completedTopicIds: 1 }).lean();
  const currentCompleted = new Set([
    ...(existingCompleted?.completedTopicIds || []),
    ...(updates.completedTopicIds || []),
  ]);
  const progressPercent = totalCoreTopics > 0
    ? Math.round((currentCompleted.size / totalCoreTopics) * 100)
    : 0;

  // Build the $set payload — never include completedTopicIds here (handled by $addToSet)
  const setFields = {
    lastStudiedAt:   new Date(),
    progressPercent,
    totalCoreTopics,
  };
  if (updates.currentTopicId !== undefined) setFields.currentTopicId = updates.currentTopicId;
  if (updates.subjectId)                   setFields.subjectId       = updates.subjectId;
  if (updates.sectionId)                   setFields.sectionId       = updates.sectionId;
  if (updates.chapterTitle)                setFields.chapterTitle     = updates.chapterTitle;
  if (updates.primarySessionId)            setFields.primarySessionId = updates.primarySessionId;

  // Build array update operators
  const arrayUpdates = {};
  if (updates.completedTopicIds?.length) {
    arrayUpdates.$addToSet = { completedTopicIds: { $each: updates.completedTopicIds } };
  }
  if (updates.linkedSessionId) {
    arrayUpdates.$addToSet = {
      ...(arrayUpdates.$addToSet || {}),
      linkedSessionIds: updates.linkedSessionId,
    };
  }

  const doc = await ChapterProgress.findOneAndUpdate(
    filter,
    {
      $set: setFields,
      $setOnInsert: {
        userId:    userId  || null,
        guestId:   guestId || null,
        chapterId,
        startedAt: new Date(),
        status:    'in_progress',
      },
      $inc: { totalMessagesExchanged: 1 },
      ...arrayUpdates,
    },
    { upsert: true, returnDocument: 'after', new: true }
  );

  await invalidateCache(userId, guestId, chapterId);

  return doc;
};

/**
 * Mark chapter as completed.
 * Called synchronously from step7 when nextTopicSignal.status === 'chapter_complete'.
 */
export const markChapterComplete = async (userId, guestId, chapterId) => {
  if (!chapterId) return null;

  const doc = await ChapterProgress.findOneAndUpdate(
    buildFilter(userId, guestId, chapterId),
    {
      $set: {
        status:           'completed',
        progressPercent:  100,
        completedAt:      new Date(),
        lastStudiedAt:    new Date(),
      },
    },
    { returnDocument: 'after', new: true }
  );

  await invalidateCache(userId, guestId, chapterId);

  if (isDev) console.log(`[ChapterProgress] Chapter completed: ${chapterId}`);
  return doc;
};

/**
 * Reset chapter progress — "start over" action.
 * Called from chapterProgress.controller POST /:chapterId/action { action: 'reset' }.
 */
export const resetChapterProgress = async (userId, guestId, chapterId) => {
  if (!chapterId) return null;

  const doc = await ChapterProgress.findOneAndUpdate(
    buildFilter(userId, guestId, chapterId),
    {
      $set: {
        status:            'in_progress',
        currentTopicId:    null,
        completedTopicIds: [],
        progressPercent:   0,
        completedAt:       null,
        lastStudiedAt:     new Date(),
      },
    },
    { returnDocument: 'after', new: true }
  );

  await invalidateCache(userId, guestId, chapterId);
  return doc;
};

/**
 * Mark chapter as "revising" — student chose to re-study a completed chapter.
 */
export const markChapterRevising = async (userId, guestId, chapterId) => {
  if (!chapterId) return null;

  const doc = await ChapterProgress.findOneAndUpdate(
    buildFilter(userId, guestId, chapterId),
    { $set: { status: 'revising', lastStudiedAt: new Date() } },
    { returnDocument: 'after', new: true }
  );

  await invalidateCache(userId, guestId, chapterId);
  return doc;
};

// ─── EVENTS ──────────────────────────────────────────────────────────────────

/**
 * Append a study event to the study_events collection.
 * ALWAYS fire-and-forget — never await this in the hot path.
 * study_events must never slow down /ask.
 */
export const logStudyEvent = (userId, guestId, sessionId, chapterId, eventType, metadata = {}) => {
  const dayBucket = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
  StudyEvent.create({
    userId:    userId    || null,
    guestId:   guestId   || null,
    sessionId,
    chapterId,
    topicId:   metadata.topicId || null,
    eventType,
    metadata,
    dayBucket,
  }).catch((err) =>
    console.error('[StudyEvent] Log failed (non-critical):', err.message)
  );
  // No await — intentional. Caller must NOT await this function.
};
