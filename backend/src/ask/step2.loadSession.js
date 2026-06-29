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
    // Only block when BOTH sides are authenticated users and they don't match.
    // If userId is null (guest / token expired), sessionId itself is the ownership proof.
    if (sessionOwner && userId && sessionOwner !== userId) {
      throw new ApiError(403, 'Yeh session aapka nahi hai.');
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

  // ─── Cross-session chapter progress sync ─────────────────────────────────
  // On a brand-new session (chatState.isNewSession), check if the student has
  // prior progress on this chapter from older sessions. If so, restore
  // currentTopicId and completedTopicIds into chatState so the pipeline
  // (especially step5 nextTopicResolver) resumes from where they left off.
  let chapterProgress = null;
  if (studyMode === 'focus' && focusChapter?.id) {
    chapterProgress = await getChapterProgress(userId, guestId, focusChapter.id);

    if (chapterProgress && chatState.isNewSession) {
      chatState.currentTopicId    = chapterProgress.currentTopicId;
      chatState.completedTopicIds = chapterProgress.completedTopicIds || [];
      if (isDev) console.log(
        `[Step 2] Cross-session sync — currentTopicId: ${chapterProgress.currentTopicId}, ` +
        `completedTopicIds: ${(chapterProgress.completedTopicIds || []).length} topics`
      );
    }
  }

  if (studyMode === 'focus' && focusChapter) {
    if (isDev) console.log(`[Step 2] Focus mode — syncing chapter: ${focusChapter.id}`);

    const isChapterSwitch = chatState.currentChapterId !== focusChapter.id;

    chatState.currentSubjectId = focusChapter.subjectId;
    chatState.currentSectionId = focusChapter.sectionId;
    chatState.currentChapterId = focusChapter.id;

    if (isChapterSwitch) {
      chatState.currentTopicId = null;
    }

    if (chatState.learningMode === 'idle') {
      chatState.learningMode = 'lesson';
    }
  } else if (studyMode === 'global') {
    if (isDev) console.log('[Step 2] Global mode — resetting chapter/topic state to idle.');
    chatState.learningMode = 'idle';
    chatState.currentSubjectId = null;
    chatState.currentSectionId = null;
    chatState.currentChapterId = null;
    chatState.currentTopicId = null;
  }

  return {
    sessionId,
    chatState,
    recentMessages,
    chapterProgress, // null for global mode or first-time chapter
  };
};