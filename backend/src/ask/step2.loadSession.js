import { randomUUID } from 'node:crypto';
import ApiError from '../utils/ApiError.js';
import { findChatSession } from '../services/chatSession.service.js';
import { getChatState } from '../services/chatState.service.js';
import { getRecentChatHistory } from '../services/chatHistory.service.js';

const TWELVE_HOURS_MS = 6 * 60 * 60 * 1000; // 6 Ghante milliseconds me

/**
 * Loads all session data needed for the Ask API flow from MongoDB using true parallelism.
 * Implements Read-First optimization, Cold-Start hydration, 12-Hour Expiry, and Live Hydration.
 *
 * @param {object} step1Input - Inputs forwarded from Step 1 validation
 * @param {string} step1Input.requestedSessionId - Session ID sent by the frontend (if any)
 * @param {string} step1Input.studyMode - "global" or "focus"
 * @param {object|null} step1Input.focusChapter - Hydrated chapter object from Step 1 (if focus mode)
 * @returns {Promise<{ sessionId, chatState: object, recentMessages: Array }>}
 */
export const loadSession = async ({ requestedSessionId, studyMode, focusChapter }) => {
  console.log('step2.loadSession.js: In-memory session parsing pipeline initiated...');

  // Senior Hack 1: Determine or generate Session ID in-memory first to unlock true parallelism
  const sessionId = requestedSessionId || randomUUID();
  console.log(`Working Session ID: ${sessionId} (Is New Session Slot: ${!requestedSessionId})`);

  // Senior Hack 2: Read-First Optimization via Concurrent Promise.all
  // Service layer ke findOne aur find methods ko concurrent execute kar rahe hain without blocking.
  const [dbSession, dbState, dbMessages] = await Promise.all([
    findChatSession(sessionId),
    getChatState(sessionId),
    getRecentChatHistory(sessionId, 8),
  ]);

  // --- 1. Recent Chat History Setup ---
  // History collection se sorted latest 8 messages milenge (already reversed array via service layer)
  const recentMessages = Array.isArray(dbMessages) ? dbMessages : [];

  // --- 2. Chat State Engine & Fallback Hydration ---
  let chatState = null;

  if (!dbState) {
    // Case A: Cold Start (Brand new user session ya chat clear scenario)
    console.log('Cold Start detected! Memory me fresh default state document hydrate kar rahe hain.');
    chatState = {
      sessionId,
      currentSubjectId: null,
      currentSectionId: null,
      currentChapterId: null,
      currentTopicId: null,
      learningMode: 'idle',
      pendingAction: null,
      completedTopicIds: [],
      lastTopic: null,
      lastDoubtTopic: null,
      lastDoubtQuestion: null,
      abuseCount: 0,
      isBlocked: false,
      isNewState: true, // Internal tracker tag: Step 7 ko batayega ki ise direct 'create' karna hai
    };
  } else {
    // Case B: Existing Session State (Mongoose document ko structural safe plain object me badalna)
    const plainState = dbState.toObject ? dbState.toObject() : { ...dbState };
    chatState = { ...plainState, isNewState: false };

    // Senior Hack 3: 12-Hour Context Expiry Filter (The Chemistry Bug Fix)
    // Agar baccha 12 ghante ke gap ke baad aaya hai, toh stale rules ko dhar-dopochna aur default par lana.
    const lastActiveTime = chatState.updatedAt ? new Date(chatState.updatedAt).getTime() : Date.now();
    if (Date.now() - lastActiveTime > TWELVE_HOURS_MS) {
      console.log('Context Expiry Triggered (>12 Hours Gap)! Resetting learningMode to idle.');
      chatState.learningMode = 'idle';
      chatState.pendingAction = null;
    }
  }

  // Senior Hack 4: Real-time Runtime Hydration (Sync with Frontend Overrides)
  // Agar student ne active screen selection badla hai, toh database state context ko live override karo.
  if (studyMode === 'focus' && focusChapter) {
    console.log(`Live Context Hydration: Syncing state with Focus Chapter -> ${focusChapter.id}`);
    chatState.currentSubjectId = focusChapter.subjectId;
    chatState.currentSectionId = focusChapter.sectionId;
    chatState.currentChapterId = focusChapter.id;

    // Default status initialization for new learning sessions
    if (chatState.learningMode === 'idle') {
      chatState.learningMode = 'lesson';
    }
  } else if (studyMode === 'global') {
    // Global mode configuration constraints override
    chatState.learningMode = 'idle';
  }

  // Security Gate Counter Enforcement: Permanent freeze lookup
  if (chatState.isBlocked) {
    throw new ApiError(403, 'Aapka yeh session temporary block kar diya gaya hai, babu. Kripya naya chat session shuru karein.');
  }

  return {
    sessionId,
    chatState,
    recentMessages,
  };
};