/**
 * step7.saveAndRespond.js — Step 7 of the Ask API flow
 * * UPGRADED PRODUCTION-GRADE STATE COMMITER
 * * CHANGES: Integrated nested state mutations via updateChatSessionState.
 */

import { addChatMessages } from '../services/chatHistory.service.js';
import { updateChatSession, updateChatSessionState, setSessionTitleIfDefault, setFirstQuestionIfEmpty } from '../services/chatSession.service.js';
import { env } from '../config/env.js';
import { logTurnSummary, recordIntentSample, logIntentAggregates } from '../utils/tokenLogger.js';

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const VALID_LEARNING_MODES = new Set(['idle', 'lesson', 'doubt', 'quiz']);

// Pipeline-generated titles that should never become a session label in the sidebar.
const SYSTEM_TITLES = new Set(['Chapter Complete!']);

// Phase 3 — Session Integrity Guard.
// UNSAFE_OR_ABUSIVE excluded from drift — abuse is tracked by its own abuseCount field.
const ACADEMIC_INTENTS = new Set(['CONCEPT_QUESTION', 'EXPLAIN_MORE', 'NEXT_STEP', 'CHOOSE_COURSE']);
const DRIFT_INTENTS    = new Set(['GREETING', 'OUT_OF_CONTEXT']);

// Allowed operational state properties inside our new ChatSession layout
const ALLOWED_STATE_FIELDS = [
  'status', 'learningMode', 'currentSubjectId', 'currentSectionId',
  'currentChapterId', 'currentTopicId', 'abuseCount', 'answerLanguage',
  'sessionTopicsProgress', 'completedTopicIds', 'pendingAction',
  'lastTopic', 'lastDoubtTopic', 'lastDoubtQuestion',
  'consecutiveErrors', 'lastErrorAt'
];

// When USE_INTENT_ROUTER=true, each intent only writes the fields it is
// responsible for. Everything else is either set by step7 code directly,
// or must never come from the LLM at all.
const INTENT_MEMORY_WHITELIST = {
  GREETING:          [],
  OUT_OF_CONTEXT:    [],
  UNSAFE_OR_ABUSIVE: [],
  CHOOSE_COURSE:     ['currentSubjectId', 'currentSectionId', 'currentChapterId', 'learningMode'],
  EXPLAIN_MORE:      ['lastDoubtTopic', 'lastDoubtQuestion'],     // NOT lastTopic — prevents drift
  CONCEPT_QUESTION:  ['lastTopic', 'lastDoubtTopic', 'lastDoubtQuestion', 'learningMode'],
  NEXT_STEP:         ['lastTopic', 'learningMode'],               // currentTopicId managed by step7 code
};

/**
 * Sanitizes the LLM's memoryUpdate to match the new strict chatState machine.
 * When intent is provided and in the whitelist, only the fields allowed for that
 * intent are kept. Otherwise falls back to the broad ALLOWED_STATE_FIELDS list.
 */
const sanitizeMemoryUpdate = ({ memoryUpdate, intent }) => {
  const cleanUpdate = {};
  const allowedFields = Object.hasOwn(INTENT_MEMORY_WHITELIST, intent)
    ? INTENT_MEMORY_WHITELIST[intent]
    : ALLOWED_STATE_FIELDS;

  for (const field of allowedFields) {
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
    title: updatedSession?.title || 'New Chat',
    status: chatState.status || 'active',
    isLocked: chatState.status === 'exhausted', // single source of truth — no separate isLocked field
    learningMode: chatState.learningMode || 'idle',
    lastTopic: chatState.lastTopic || null,
    lastSubject: chatState.currentSubjectId || null,
    lastSection: chatState.currentSectionId || null,
    lastChapterId: chatState.currentChapterId || null,
    sessionType: updatedSession?.sessionType || 'global',
    messageCount: chatState.messageCount || 0,
    totalTokensUsed: updatedSession?.totalTokensUsed ?? 0,
  };
};

/**
 * Step 7: Commits transaction updates to DB and responds to client.
 */
export const saveAndRespond = async (
  { question, studyMode, focusChapter },
  { sessionId, chatState },
  { language, driftSignal },
  decision,
  { retrieval, sources, nextTopicSignal },
  response,
  userId = null,
  tokenUsage = 0
) => {
  console.log(`[Step 7 Commiting] Writing updates atomically for Session ID: ${sessionId}`);

  // Step 7a: Sanitize the state updates generated during the conversation turn.
  // intent is passed so the per-intent whitelist (INTENT_MEMORY_WHITELIST) is used
  // when USE_INTENT_ROUTER=true. Falls back to ALLOWED_STATE_FIELDS for legacy path.
  const stateUpdates = sanitizeMemoryUpdate({
    memoryUpdate: response.memoryUpdate,
    intent: decision?.intent,
  });

  // If NEXT_STEP resolved a new topic, advance the pointer and record the completed one
  if (nextTopicSignal) {
    stateUpdates.currentTopicId = nextTopicSignal.topicId;

    if (chatState?.currentTopicId) {
      stateUpdates.completedTopicIds = [
        ...(chatState.completedTopicIds || []),
        chatState.currentTopicId,
      ];
    }
  }

  // Successful response — provider is working. Reset error tracking.
  stateUpdates.consecutiveErrors = 0;
  stateUpdates.lastErrorAt = null;

  // STB-008: Force sync DB state on global mode — do not rely on LLM memoryUpdate.
  // LLM never returns chapter fields on global turns, so DB would retain stale 'lesson' values.
  if (studyMode === 'global') {
    stateUpdates.learningMode = 'idle';
    stateUpdates.currentSubjectId = null;
    stateUpdates.currentSectionId = null;
    stateUpdates.currentChapterId = null;
    stateUpdates.currentTopicId = null;
  }

  // Automatically update dynamic tracking metrics on user interaction
  if (response.responseMode) {
    stateUpdates.answerLanguage = language.answerLanguage;
  }

  // sessionType derived from studyMode — set once on creation, immutable after.
  const sessionType = studyMode === 'focus' ? 'focus' : 'global';

  // Phase 3 — Session Integrity Guard: update drift counters in the same atomic op.
  // Academic turns reset the consecutive streak. Drift turns increment both counters.
  // UNSAFE_OR_ABUSIVE is excluded — abuse is tracked by its own abuseCount field.
  const intent = decision?.intent ?? 'CONCEPT_QUESTION';
  const chatStateInc = { messageCount: 1 };
  if (ACADEMIC_INTENTS.has(intent)) {
    stateUpdates.consecutiveNonAcademicTurns = 0;
    console.log(`[Drift] ${intent} → consecutive reset to 0`);
  } else if (DRIFT_INTENTS.has(intent)) {
    chatStateInc.consecutiveNonAcademicTurns = 1;
    chatStateInc.totalNonAcademicTurns = 1;
    const prevConsec = chatState.consecutiveNonAcademicTurns ?? 0;
    const prevTotal  = chatState.totalNonAcademicTurns       ?? 0;
    console.log(`[Drift] ${intent} → consecutive ${prevConsec} → ${prevConsec + 1} | total ${prevTotal} → ${prevTotal + 1}`);
  }

  // Single atomic MongoDB op: chatState $set + messageCount $inc + totalTokensUsed $inc + $setOnInsert immutables.
  const updatedSession = await updateChatSession(
    sessionId,
    {
      chatStateSet: removeUndefinedFields(stateUpdates),
      chatStateInc,
      topLevelInc: { totalTokensUsed: tokenUsage },
    },
    { userId, sessionType }
  );

  // P2-T4: Check if this turn pushed the session over the token limit.
  const newTotal = updatedSession?.totalTokensUsed ?? 0;
  const turnNumber = updatedSession?.chatState?.messageCount ?? 1;

  // STEP-0: Turn summary — shows decider + tutor breakdown and session health.
  logTurnSummary({
    sessionId,
    turnNumber,
    intent:     decision?.intent ?? 'UNKNOWN',
    overridden: decision?._overridden ?? false,
    decider: decision?.tokenBreakdown ?? { input: 0, output: 0, total: decision?.tokenUsage ?? 0 },
    tutor:   response?.tokenBreakdown ?? { input: 0, output: 0, total: response?.tokenUsage ?? 0 },
    sessionTotal: newTotal,
    sessionLimit: env.sessionTokenLimit,
    driftSignal,
  });
  const cachedTokens = (decision?.tokenBreakdown?.cached ?? 0) + (response?.tokenBreakdown?.cached ?? 0);
  recordIntentSample(decision?.intent, tokenUsage, cachedTokens, decision?._overridden ?? false, DRIFT_INTENTS.has(intent));
  if (turnNumber % 10 === 0) logIntentAggregates();
  if (newTotal >= env.sessionTokenLimit) {
    try {
      await updateChatSessionState(sessionId, { status: 'exhausted' }, userId);
      if (updatedSession.chatState) updatedSession.chatState.status = 'exhausted';
      console.log(`[Step 7] Session locked — totalTokensUsed: ${newTotal} >= limit: ${env.sessionTokenLimit}`);
    } catch {
      // Non-critical — session will be locked on next DB read anyway
    }
  }

  // Save first student question as sidebar preview — only fires on turn 1 (messageCount just became 1).
  // setFirstQuestionIfEmpty is a no-op on all subsequent turns (null-filter guard).
  if ((updatedSession?.chatState?.messageCount ?? 0) === 1) {
    setFirstQuestionIfEmpty(sessionId, question).catch(() => {}); // non-critical, fire-and-forget
  }

  // P2-T3: Auto-title using the answer heading already computed by step6 — zero extra LLM cost.
  // Only fires when: (a) session still has the default 'New Chat' title, (b) this is a real
  // study answer (study_tutor + answered), and (c) the title is not a system-generated label.
  // The { title: 'New Chat' } condition inside setSessionTitleIfDefault makes this race-safe.
  if (
    updatedSession.title === 'New Chat' &&
    response.responseMode === 'study_tutor' &&
    response.status === 'answered' &&
    response.title &&
    !SYSTEM_TITLES.has(response.title)
  ) {
    try {
      await setSessionTitleIfDefault(sessionId, response.title.trim());
      updatedSession.title = response.title.trim(); // sync in-memory so buildSessionPayload sees it
    } catch {
      // Non-critical — title stays 'New Chat', main pipeline is unaffected
    }
  }

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
  ], userId);

  console.log('[Step 7 Complete] Database sync finalized successfully. Releasing payload.');
  return answerPayload;
};