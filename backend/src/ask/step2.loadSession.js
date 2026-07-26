/**
 * step2.loadSession.js — Step 2 of the Ask API flow
 * * UPGRADED PRODUCTION-GRADE PIPELINE WITH EMBEDDED ARRAY SUPPORT
 */

import { randomUUID } from 'node:crypto';
import ApiError from '../utils/ApiError.js';
import { findChatSession } from '../services/chatSession.service.js';
import { getRecentChatHistory } from '../services/chatHistory.service.js';
import { getDefaultChatState } from '../models/chatSession.model.js';
import { getChapterProgress } from '../services/chapterProgress.service.js';

const INACTIVITY_THRESHOLD_MS = 15 * 60 * 1000; // 15 Mins
const isDev = process.env.NODE_ENV !== 'production';

export const loadSession = async ({ requestedSessionId, userId, guestId, studyMode, focusChapter }) => {
  const sessionId = requestedSessionId || randomUUID();
  if (isDev) console.log(`[Step 2] loadSession — sessionId: ${sessionId}, isNew: ${!requestedSessionId}`);

  // Parallel lookup directly hitting primary key indexe
  const [dbSession, dbMessages] = await Promise.all([
    findChatSession(sessionId),
    getRecentChatHistory(sessionId, 14), // Requests last 14 messages clean slice array
  ]);

  // Backward compatible message window layer array parsing
  const recentMessages = Array.isArray(dbMessages) ? dbMessages : [];

  let chatState = null;

  if (dbSession) {
    const sessionOwner = dbSession.userId?.toString();
    // If the session has a real owner, the requester must present that same
    // userId. A missing/guest requester (userId null) does NOT bypass this —
    // only a genuinely ownerless (guest) session skips the check.
    if (sessionOwner && sessionOwner !== userId) {
      throw new ApiError(403, 'Yeh session aapka nahi hai.');
    }

    // Mode-mismatch guard — sessionType is immutable once a session is created
    // (set once via $setOnInsert, see chatSession.service.js), but studyMode
    // arrives fresh on every request. Reusing a session whose sessionType
    // doesn't match the incoming studyMode would corrupt it (chapter fields
    // get wiped/populated inconsistently with sessionType — see
    // GLOBAL_MODE_VERIFICATION_CHECKLIST.md A2/E1 for the two confirmed UI
    // paths this happens through). Rather than patch every place a mismatch
    // could originate (today's UI buttons, or any future client), enforce the
    // invariant here structurally: a mismatch is treated exactly like no
    // session was requested at all, reusing the already-proven cold-start path
    // below instead of duplicating its logic. The old session is never
    // touched — it's simply not reused.
    if (dbSession.sessionType && dbSession.sessionType !== studyMode) {
      if (isDev) console.warn(
        `[Step 2] Mode mismatch — session ${sessionId} is sessionType="${dbSession.sessionType}" ` +
        `but request is studyMode="${studyMode}". Starting a fresh session instead.`
      );
      return loadSession({ requestedSessionId: null, userId, guestId, studyMode, focusChapter });
    }
  }

  if (!dbSession) {
    if (isDev) console.log('[Step 2] Cold start — new session instantiated.');
    chatState = {
      ...getDefaultChatState(),
      isNewSession: true,
    };
  } else {
    const plainSession = dbSession.toObject ? dbSession.toObject() : { ...dbSession };
    chatState = plainSession.chatState ? { ...plainSession.chatState } : {};
    chatState.isNewSession = false;

    if (chatState.status === 'blocked') {
      throw new ApiError(403, 'Aapka yeh session temporary block kar diya gaya hai, babu. Kripya naya fresh chat room shuru karein.');
    }

    if (chatState.status === 'exhausted') {
      throw new ApiError(429, 'Hamari baat bahut lambi ho gayi! Ek nayi chat shuru karo — fresh start mein aur clearly padh sakte hain.');
    }

    const lastActiveTime = dbSession.updatedAt ? new Date(dbSession.updatedAt).getTime() : Date.now();
    if (Date.now() - lastActiveTime > INACTIVITY_THRESHOLD_MS) {
      if (isDev) console.log('[Step 2] Inactivity gap detected — resetting learningMode to idle.');
      chatState.learningMode = 'idle';
      chatState.pendingAction = null;
      // Reset streak counter — student returned fresh, don't greet them with Tier 2 redirect.
      // totalNonAcademicTurns intentionally NOT reset (session-lifetime metric for hard cap).
      chatState.consecutiveNonAcademicTurns = 0;
    }
  }

  // ─── Cross-session chapter progress (single source of truth) ─────────────
  // ChapterProgress (not chatState) owns currentTopicId/completedTopicIds now.
  // Loaded fresh on every focus turn (Redis-cached, 60s TTL — cheap) so step5's
  // NEXT_STEP resolver and step7's engagement writes always see the latest
  // cross-session state, regardless of whether this is a new or existing session.
  // Read failure is non-fatal: gracefully degrade to null (treated as "not started
  // yet" by getNextTopic) rather than failing the whole turn — self-healing on the
  // next successful read/write since the underlying Mongo document is untouched.
  let chapterProgress = null;
  if (studyMode === 'focus' && focusChapter?.id) {
    try {
      chapterProgress = await getChapterProgress(userId, guestId, focusChapter.id);
      if (isDev) console.log(
        `[Step 2] ChapterProgress loaded — currentTopicId: ${chapterProgress?.currentTopicId ?? 'none'}, ` +
        `completedTopicIds: ${(chapterProgress?.completedTopicIds || []).length} topics`
      );
    } catch (err) {
      console.error('[Step 2] getChapterProgress failed (non-fatal, continuing with null):', err.message);
      chapterProgress = null;
    }
  }

  if (studyMode === 'focus' && focusChapter) {
    if (isDev) console.log(`[Step 2] Focus mode — syncing chapter: ${focusChapter.id}`);

    chatState.currentSubjectId = focusChapter.subjectId;
    chatState.currentSectionId = focusChapter.sectionId;
    chatState.currentChapterId = focusChapter.id;

    if (chatState.learningMode === 'idle') {
      chatState.learningMode = 'lesson';
    }
  } else if (studyMode === 'global') {
    if (isDev) console.log('[Step 2] Global mode — resetting chapter/topic state to idle.');
    chatState.learningMode = 'idle';
    chatState.currentSubjectId = null;
    chatState.currentSectionId = null;
    chatState.currentChapterId = null;
  }

  return {
    sessionId,
    chatState,
    recentMessages,
    chapterProgress, // null for global mode or first-time chapter
  };
};