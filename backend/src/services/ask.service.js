import { randomUUID } from 'node:crypto';

import { formatSources } from '../rag/query/answer/answerService.js';
import { retrieveRelevantChunks } from '../rag/query/retriever/retriever.js';
import {
  decideRetrieval,
} from '../tutor/llmFlow/retrievalDecider.js';
import {
  formatMemoryForPrompt,
  formatRecentHistory,
  formatRetrievedContext,
  formatStudyMapSummary,
  getLastTutorResponse,
} from '../tutor/llmFlow/promptHelpers.js';
import { generateTutorResponse } from '../tutor/llmFlow/tutorResponder.js';
import { detectConversationLanguage } from '../utils/languageDetector.js';
import ApiError from '../utils/ApiError.js';
import { addChatMessages, getRecentChatHistory } from './chatHistory.service.js';
import { createChatSession, getOrCreateChatSession } from './chatSession.service.js';
import { getOrCreateChatState, updateChatState } from './chatState.service.js';
import { findStudyMapChapter, getStudyMap } from './studyMap.service.js';

const STUDY_MODES = {
  global: 'global',
  focus: 'focus',
};

const normalizeText = (value) =>
  String(value || '').replace(/\s+/g, ' ').trim();

const validateStudyMode = (studyMode) => {
  if (!Object.values(STUDY_MODES).includes(studyMode)) {
    throw new ApiError(400, 'studyMode must be either "global" or "focus".');
  }
};

const getDbSession = async (requestedSessionId) => {
  if (requestedSessionId) {
    return getOrCreateChatSession(requestedSessionId);
  }

  return createChatSession({ sessionId: randomUUID() });
};

const validateFocusRequest = async ({ studyMode, chapterId }) => {
  if (studyMode !== STUDY_MODES.focus) {
    return null;
  }

  const cleanChapterId = normalizeText(chapterId);

  if (!cleanChapterId) {
    throw new ApiError(400, 'chapterId is required when studyMode is "focus".');
  }

  const chapter = await findStudyMapChapter(cleanChapterId);

  if (!chapter) {
    throw new ApiError(404, `Chapter not found for chapterId: ${cleanChapterId}`);
  }

  return chapter;
};

const stringifyPromptValue = (value) =>
  JSON.stringify(value || null, null, 2);

const createFocusPromptValue = (chapter) => {
  if (!chapter) {
    return 'No focus chapter selected.';
  }

  return stringifyPromptValue({
    subjectId: chapter.subjectId,
    subjectTitle: chapter.subjectTitle,
    sectionId: chapter.sectionId,
    sectionTitle: chapter.sectionTitle,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
  });
};

const getRetrieverOptions = (chapter) => {
  if (!chapter) {
    return {};
  }

  return {
    metadataFilter: chapter.metadataFilter,
    requireTermMatchForLatinQuery: true,
  };
};

const retrieveContextForDecision = async ({ decision, focusChapter }) => {
  if (!decision.needsRetrieval) {
    return {
      retrieval: null,
      chunks: [],
      sources: [],
    };
  }

  const retrieval = await retrieveRelevantChunks(decision.searchQuery, getRetrieverOptions(focusChapter));
  const chunks = retrieval.results || [];

  return {
    retrieval,
    chunks,
    sources: formatSources(chunks),
  };
};

const sanitizeSuggestedActions = (actions) => {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .filter((action) => action && typeof action === 'object')
    .map((action) => ({
      type: normalizeText(action.type).slice(0, 60),
      label: normalizeText(action.label).slice(0, 80),
    }))
    .filter((action) => action.type && action.label)
    .slice(0, 4);
};

const sanitizeMemoryUpdate = ({ memoryUpdate, question, response, studyMode, sources }) => {
  const allowedLearningModes = new Set(['idle', 'lesson', 'doubt', 'revision']);
  const allowedStringFields = [
    'currentSubjectId',
    'currentSectionId',
    'currentChapterId',
    'currentTopicId',
    'learningMode',
    'pendingAction',
    'lastTopic',
    'lastDoubtTopic',
    'lastDoubtQuestion',
  ];
  const cleanUpdate = {};

  for (const field of allowedStringFields) {
    if (Object.hasOwn(memoryUpdate || {}, field)) {
      const cleanValue = memoryUpdate[field] === null
        ? null
        : normalizeText(memoryUpdate[field]);

      cleanUpdate[field] = field === 'learningMode' && cleanValue && !allowedLearningModes.has(cleanValue)
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

const removeUndefinedFields = (data) => {
  const cleanData = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      cleanData[key] = value;
    }
  }

  return cleanData;
};

const createSessionPayload = (sessionId, chatState) => ({
  sessionId,
  lastTopic: chatState?.lastTopic || null,
  lastDoubtTopic: chatState?.lastDoubtTopic || null,
  lastSubject: chatState?.currentSubjectId || null,
  lastSection: chatState?.currentSectionId || null,
  lastChapterId: chatState?.currentChapterId || null,
});

const buildAnswerPayload = ({
  question,
  studyMode,
  language,
  decision,
  response,
  sources,
  retrieval,
  sessionId,
  chatState,
}) => ({
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
    ? {
        question: retrieval.question,
        returnedCount: retrieval.debug?.returnedCount || 0,
      }
    : null,
  decision,
  session: createSessionPayload(sessionId, chatState),
});

export const askQuestion = async (body = {}) => {
  const question = normalizeText(body.question);
  const studyMode = normalizeText(body.studyMode);
  const requestedSessionId = normalizeText(body.sessionId);

  if (!question) {
    throw new ApiError(400, 'question is required.');
  }

  validateStudyMode(studyMode);

  if (studyMode === STUDY_MODES.global && body.chapterId) {
    throw new ApiError(400, 'chapterId is allowed only when studyMode is "focus".');
  }

  const focusChapter = await validateFocusRequest({
    studyMode,
    chapterId: body.chapterId,
  });
  const [dbSession, studyMap] = await Promise.all([
    getDbSession(requestedSessionId),
    getStudyMap(),
  ]);
  const sessionId = dbSession.sessionId;
  const [chatState, recentMessages] = await Promise.all([
    getOrCreateChatState(sessionId),
    getRecentChatHistory(sessionId, 8),
  ]);
  const language = detectConversationLanguage({
    question,
    recentMessages,
  });
  const memory = stringifyPromptValue(formatMemoryForPrompt(chatState));
  const history = formatRecentHistory(recentMessages);
  const lastTutorResponse = getLastTutorResponse(recentMessages);
  const curriculumSummary = formatStudyMapSummary(studyMap);
  const focusChapterPrompt = createFocusPromptValue(focusChapter);
  const decision = await decideRetrieval({
    message: question,
    memory,
    history,
    curriculumSummary,
    focusChapter: focusChapterPrompt,
  });
  const retrievalResult = await retrieveContextForDecision({
    decision,
    focusChapter,
  });
  const retrievedContext = formatRetrievedContext(retrievalResult.chunks);
  const tutorResponse = await generateTutorResponse({
    message: question,
    answerLanguage: language.answerLanguage,
    responseMode: decision.responseMode,
    decision: stringifyPromptValue(decision),
    memory,
    history,
    lastTutorResponse,
    curriculumSummary,
    focusChapter: focusChapterPrompt,
    retrievedContext,
  });
  const sources = retrievalResult.sources;
  const stateUpdates = sanitizeMemoryUpdate({
    memoryUpdate: tutorResponse.memoryUpdate,
    question,
    response: tutorResponse,
    studyMode,
    sources,
  });

  const updatedState = await updateChatState(sessionId, removeUndefinedFields(stateUpdates));
  const answerPayload = buildAnswerPayload({
    question,
    studyMode,
    language,
    decision,
    response: tutorResponse,
    sources,
    retrieval: retrievalResult.retrieval,
    sessionId,
    chatState: updatedState,
  });

  await addChatMessages(sessionId, [
    {
      role: 'student',
      text: question,
      metadata: {
        studyMode,
        chapterId: body.chapterId || null,
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
