/**
 * step7.saveAndRespond.js — Step 7 of the Ask API flow
 *
 * WHAT IT DOES:
 *   Final step — saves all results to MongoDB and builds the API response.
 *
 *   1. Clean and validate the memoryUpdate from the LLM (prevent bad values)
 *   2. Update the chat state in MongoDB (tutor's memory for next turn)
 *   3. Save both the student message and Zuno's reply to chat history
 *   4. Build and return the final API response payload
 *
 * RETURNS:
 *   The complete API response object that gets sent back to the frontend.
 *   Includes: status, intent, question, answer, sections, sources, session, etc.
 */

import { addChatMessages } from '../services/chatHistory.service.js';
import { updateChatState } from '../services/chatState.service.js';

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const VALID_LEARNING_MODES = new Set(['idle', 'lesson', 'doubt', 'revision']);
const ALLOWED_STATE_FIELDS = [
  'currentSubjectId', 'currentSectionId', 'currentChapterId',
  'currentTopicId', 'learningMode', 'pendingAction',
  'lastTopic', 'lastDoubtTopic', 'lastDoubtQuestion',
];

/**
 * Sanitizes the LLM's memoryUpdate to only allow known fields and valid values.
 * Prevents the LLM from corrupting the state with unexpected fields or values.
 */
const sanitizeMemoryUpdate = ({ memoryUpdate, question, response, studyMode, sources }) => {
  const cleanUpdate = {};

  for (const field of ALLOWED_STATE_FIELDS) {
    if (Object.hasOwn(memoryUpdate || {}, field)) {
      const cleanValue = memoryUpdate[field] === null
        ? null
        : cleanText(memoryUpdate[field]);

      // Ensure learningMode only gets valid values
      cleanUpdate[field] = field === 'learningMode' && cleanValue && !VALID_LEARNING_MODES.has(cleanValue)
        ? 'idle'
        : cleanValue;
    }
  }

  return {
    ...cleanUpdate,
    preferredStudyMode: studyMode,
    lastTutorAction: response.responseMode,
    lastIntent: response.responseMode,
    lastStudentMessage: question,
    lastAnswer: response.answer,
    lastSources: sources,
    lastDoubtSources: response.responseMode === 'study_tutor' ? sources : undefined,
  };
};

/**
 * Removes undefined fields from an object (MongoDB update objects don't allow undefined).
 */
const removeUndefinedFields = (data) => {
  const cleanData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) cleanData[key] = value;
  }
  return cleanData;
};

/**
 * Sanitizes the suggested actions from the LLM response.
 * Each action must have a type and label; capped at 4 actions.
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
 * Builds the session info block in the response (for frontend state tracking).
 */
const buildSessionPayload = (sessionId, chatState) => ({
  sessionId,
  lastTopic: chatState?.lastTopic || null,
  lastDoubtTopic: chatState?.lastDoubtTopic || null,
  lastSubject: chatState?.currentSubjectId || null,
  lastSection: chatState?.currentSectionId || null,
  lastChapterId: chatState?.currentChapterId || null,
});

/**
 * Step 7: Save to MongoDB and build the final API response.
 *
 * @param {{ question, studyMode }}                            input    - From Step 1
 * @param {{ sessionId }}                                      session  - From Step 2
 * @param {{ language }}                                       context  - From Step 3
 * @param {{ responseMode }}                                   decision - From Step 4
 * @param {{ retrieval, sources }}                             retrieval - From Step 5
 * @param {object}                                             response - From Step 6
 * @returns {object}                                                    - Final API response
 */
export const saveAndRespond = async (
  { question, studyMode, focusChapter },
  { sessionId },
  { language },
  decision,
  { retrieval, sources },
  response
) => {
  // Step 7a: Clean the LLM's memory update and save it to MongoDB
  const stateUpdates = sanitizeMemoryUpdate({
    memoryUpdate: response.memoryUpdate,
    question,
    response,
    studyMode,
    sources,
  });

  const updatedState = await updateChatState(sessionId, removeUndefinedFields(stateUpdates));

  // Step 7b: Build the final API response payload
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
    session: buildSessionPayload(sessionId, updatedState),
  };

  // Step 7c: Save both messages to chat history for future context
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
        decision,
        sections: answerPayload.sections,
      },
    },
  ]);

  return answerPayload;
};
