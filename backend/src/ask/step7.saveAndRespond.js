/**
 * step7.saveAndRespond.js — Step 7 of the Ask API flow
 * * UPGRADED PRODUCTION-GRADE STATE COMMITER
 * * CHANGES: Integrated nested state mutations via updateChatSessionState.
 */

import { addChatMessages } from '../services/chatHistory.service.js';
import { updateChatSessionState } from '../services/chatSession.service.js';

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const VALID_LEARNING_MODES = new Set(['idle', 'lesson', 'doubt', 'quiz']);

// Allowed operational state properties inside our new ChatSession layout
const ALLOWED_STATE_FIELDS = [
  'status', 'learningMode', 'currentSubjectId', 'currentSectionId',
  'currentChapterId', 'currentTopicId', 'abuseCount', 'answerLanguage',
  'sessionTopicsProgress', 'pendingAction',
  'lastTopic', 'lastDoubtTopic', 'lastDoubtQuestion'
];

/**
 * Sanitizes the LLM's memoryUpdate to match the new strict chatState machine.
 */
const sanitizeMemoryUpdate = ({ memoryUpdate }) => {
  const cleanUpdate = {};

  for (const field of ALLOWED_STATE_FIELDS) {
    if (Object.hasOwn(memoryUpdate || {}, field)) {
      const cleanValue = memoryUpdate[field] === null
        ? null
        : memoryUpdate[field];

      // Safe string normalization for scalar types
      if (typeof cleanValue === 'string') {
        cleanUpdate[field] = cleanText(cleanValue);
      } else {
        cleanUpdate[field] = cleanValue;
      }

      // Enforce learningMode boundaries safely
      if (field === 'learningMode' && cleanUpdate[field] && !VALID_LEARNING_MODES.has(cleanUpdate[field])) {
        cleanUpdate[field] = 'idle';
      }
    }
  }

  return cleanUpdate;
};

/**
 * Removes undefined fields to keep MongoDB queries compliant.
 */
const removeUndefinedFields = (data) => {
  const cleanData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleanData[key] = value;
  }
  return cleanData;
};

/**
 * Sanitizes action labels for interface cards rendering.
 */
const sanitizeSuggestedActions = (actions) => {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => action && typeof action === 'object')
    .map((action) => ({
      type: cleanText(action.type).slice(0, 60),
      label: cleanText(action.label).slice(0, 80),
    }))
    .filter((action) => action.type && action.label)
    .slice(0, 4);
};

/**
 * Formats data snapshots back to the client interface layer.
 */
const buildSessionPayload = (sessionId, updatedSession) => {
  const chatState = updatedSession?.chatState || {};
  return {
    sessionId,
    status: chatState.status || 'active',
    learningMode: chatState.learningMode || 'idle',
    lastTopic: chatState.lastTopic || null,
    lastSubject: chatState.currentSubjectId || null,
    lastSection: chatState.currentSectionId || null,
    lastChapterId: chatState.currentChapterId || null,
  };
};

/**
 * Step 7: Commits transaction updates to DB and responds to client.
 */
export const saveAndRespond = async (
  { question, studyMode, focusChapter },
  { sessionId },
  { language },
  decision,
  { retrieval, sources },
  response
) => {
  console.log(`[Step 7 Commiting] Writing updates atomically for Session ID: ${sessionId}`);

  // Step 7a: Sanitize the state updates generated during the conversation turn
  const stateUpdates = sanitizeMemoryUpdate({
    memoryUpdate: response.memoryUpdate,
  });

  // Automatically update dynamic tracking metrics on user interaction
  if (response.responseMode) {
    stateUpdates.answerLanguage = language.answerLanguage;
  }

  // Persist nested states cleanly using our updated session logic helper
  const updatedSession = await updateChatSessionState(sessionId, removeUndefinedFields(stateUpdates));

  // Step 7b: Assemble the standardized outer structural response contract
  const answerPayload = {
    status: response.status,
    intent: response.responseMode,
    responseMode: response.responseMode,
    studyMode,
    question,
    detectedLanguage: language.detectedLanguage,
    answerLanguage: language.answerLanguage,
    title: response.title,
    sections: response.sections,
    answer: response.answer,
    sources,
    suggestedActions: sanitizeSuggestedActions(response.suggestedActions),
    retrieval: retrieval
      ? { question: retrieval.question, returnedCount: retrieval.debug?.returnedCount || 0 }
      : null,
    decision,
    session: buildSessionPayload(sessionId, updatedSession),
  };

  // Step 7c: Append historical text prose into the isolated history bank log
  await addChatMessages(sessionId, [
    {
      role: 'student',
      text: question,
      metadata: {
        studyMode,
        chapterId: focusChapter?.id || null,
      },
    },
    {
      role: 'tutor',
      text: answerPayload.answer,
      action: answerPayload.intent,
      sources,
      metadata: {
        status: answerPayload.status,
        responseMode: answerPayload.responseMode,
        sections: answerPayload.sections,
      },
    },
  ]);

  console.log('[Step 7 Complete] Database sync finalized successfully. Releasing payload.');
  return answerPayload;
};