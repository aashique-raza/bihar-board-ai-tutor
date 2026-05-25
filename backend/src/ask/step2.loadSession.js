/**
 * step2.loadSession.js — Step 2 of the Ask API flow
 *
 * WHAT IT DOES:
 *   Loads (or creates) the student's session data from MongoDB.
 *   Three things are loaded in parallel:
 *   1. Chat Session  — the top-level session record (session ID, creation time)
 *   2. Chat State    — the tutor's memory of what the student was doing
 *   3. Recent History — the last 8 messages in this session
 *
 * WHY PARALLEL?
 *   All three are independent DB queries — running them together is faster.
 *
 * RETURNS:
 *   { sessionId, chatState, recentMessages }
 */

import { randomUUID } from 'node:crypto';

import {
  createChatSession,
  getOrCreateChatSession,
} from '../services/chatSession.service.js';
import {
  getOrCreateChatState,
} from '../services/chatState.service.js';
import {
  getRecentChatHistory,
} from '../services/chatHistory.service.js';

/**
 * Gets an existing session or creates a new one.
 * If requestedSessionId is provided (frontend sends it on follow-up messages),
 * we reuse that session. Otherwise, a fresh session is created.
 */
const getOrCreateSession = async (requestedSessionId) => {
  if (requestedSessionId) {
    return getOrCreateChatSession(requestedSessionId);
  }
  return createChatSession({ sessionId: randomUUID() });
};

/**
 * Loads all session data needed for the Ask API flow from MongoDB.
 *
 * @param {{ requestedSessionId }} input - From Step 1
 * @returns {{ sessionId, chatState, recentMessages }}
 */
export const loadSession = async ({ requestedSessionId }) => {
  // Step 2a: Get or create the session record (determines the sessionId we use)
  const dbSession = await getOrCreateSession(requestedSessionId);
  const sessionId = dbSession.sessionId;

  // Step 2b: Load chat state and recent history in parallel (both need sessionId)
  const [chatState, recentMessages] = await Promise.all([
    getOrCreateChatState(sessionId),     // Tutor's memory: last topic, current chapter, mode
    getRecentChatHistory(sessionId, 8),  // Last 8 messages for conversation context
  ]);

  return {
    sessionId,
    chatState,
    recentMessages,
  };
};
