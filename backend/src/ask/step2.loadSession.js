/**
 * step2.loadSession.js — Step 2 of the Ask API flow
 * * UPGRADED PRODUCTION-GRADE PIPELINE WITH EMBEDDED ARRAY SUPPORT
 */

import { randomUUID } from 'node:crypto';
import ApiError from '../utils/ApiError.js';
import { findChatSession } from '../services/chatSession.service.js';
import { getRecentChatHistory } from '../services/chatHistory.service.js';

const INACTIVITY_THRESHOLD_MS = 15 * 60 * 1000; // 15 Mins

export const loadSession = async ({ requestedSessionId, studyMode, focusChapter }) => {
  console.log('step2.loadSession.js: In-memory session parsing pipeline initiated...');

  const sessionId = requestedSessionId || randomUUID();
  console.log(`Working Session ID: ${sessionId} (Is New Session Slot: ${!requestedSessionId})`);

  // Parallel lookup directly hitting primary key indexe
  const [dbSession, dbMessages] = await Promise.all([
    findChatSession(sessionId),
    getRecentChatHistory(sessionId, 14), // Requests last 14 messages clean slice array
  ]);

  // Backward compatible message window layer array parsing
  const recentMessages = Array.isArray(dbMessages) ? dbMessages : [];

  let chatState = null;

  if (!dbSession) {
    console.log('[Step 2 Cold Start] No active record found. Instantiating pristine virtual state parameters.');
    chatState = {
      status: 'active',
      learningMode: 'idle',
      currentSubjectId: null,
      currentSectionId: null,
      currentChapterId: null,
      currentTopicId: null,
      abuseCount: 0,
      answerLanguage: 'hinglish',
      sessionTopicsProgress: [],
      pendingAction: null,
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
      throw new ApiError(429, 'Babu, is room ke token ki limit poori ho gayi hai. Kripya fresh study conversation ke liye naya session shuru karein.');
    }

    const lastActiveTime = dbSession.updatedAt ? new Date(dbSession.updatedAt).getTime() : Date.now();
    if (Date.now() - lastActiveTime > INACTIVITY_THRESHOLD_MS) {
      console.log(`[Step 2 Dormancy Triggers] User returned after inactivity gap. Resetting active behavior modes.`);
      chatState.learningMode = 'idle';
      chatState.pendingAction = null;
    }
  }

  if (studyMode === 'focus' && focusChapter) {
    console.log(`Live Context Hydration: Syncing state with Focus Chapter -> ${focusChapter.id}`);
    chatState.currentSubjectId = focusChapter.subjectId;
    chatState.currentSectionId = focusChapter.sectionId;
    chatState.currentChapterId = focusChapter.id;

    if (chatState.learningMode === 'idle') {
      chatState.learningMode = 'lesson';
    }
  } else if (studyMode === 'global') {
    console.log('[Step 2 Sandbox Override] Global exploration active. Capping tutor focus to idle.');
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
  };
};