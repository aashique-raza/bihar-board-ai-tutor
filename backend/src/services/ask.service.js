import { getSessionContext, normalizeSessionId, saveSessionContext } from '../tutor/context/sessionContextStore.js';
import { executeTutorAction } from '../tutor/executor/actionExecutor.js';
import { normalizeMessage } from '../tutor/normalization/normalizeMessage.js';
import { planTutorAction } from '../tutor/planner/tutorPlanner.js';
import { detectQuestionLanguage } from '../utils/languageDetector.js';
import ApiError from '../utils/ApiError.js';
import { addChatMessage } from './chatHistory.service.js';
import { getOrCreateChatSession, createChatSession } from './chatSession.service.js';
import { getOrCreateChatState, updateChatState } from './chatState.service.js';
import { findStudyMapChapter } from './studyMap.service.js';

const STUDY_MODES = {
  global: 'global',
  focus: 'focus',
};

const STATUS = {
  answered: 'answered',
  focusContextNotFound: 'focus_context_not_found',
  globalContextNotFound: 'global_context_not_found',
};

const normalizeText = (value) => String(value || '').trim();

const getDbSession = async (requestedSessionId) => {
  if (requestedSessionId) {
    return getOrCreateChatSession(requestedSessionId);
  }

  return createChatSession();
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

const loadDbStateIntoSession = (sessionId, chatState) => {
  saveSessionContext(sessionId, {
    lastIntent: chatState.lastIntent || chatState.lastTutorAction || null,
    lastSubject: chatState.currentSubjectId || null,
    lastSection: chatState.currentSectionId || null,
    lastChapterId: chatState.currentChapterId || null,
    lastTopic: chatState.lastTopic || chatState.currentTopicId || null,
    lastDoubtTopic: chatState.lastDoubtTopic || null,
    lastDoubtQuestion: chatState.lastDoubtQuestion || null,
    lastDoubtSources: chatState.lastDoubtSources || [],
    lastQuestion: chatState.lastStudentMessage || null,
    lastAnswer: chatState.lastAnswer || null,
    lastSources: chatState.lastSources || [],
  });
};

const saveTutorTurn = async ({
  sessionId,
  question,
  response,
  sessionContext,
  route,
  chatState,
  status = null,
  stateUpdates = {},
}) => {
  await addChatMessage({
    sessionId,
    role: 'tutor',
    text: response.answer,
    action: response.intent || route.intent,
    sources: response.sources || [],
    metadata: {
      status: response.status,
      studyMode: response.studyMode,
      scope: response.scope || null,
      normalizedQuestion: response.normalizedQuestion || null,
      resolvedQuestion: response.resolvedQuestion || null,
    },
  });

  const shouldSaveDoubtTopic =
    status === STATUS.answered &&
    !chatState.currentChapterId &&
    sessionContext.lastTopic;
  const shouldSaveDoubtContext = status === STATUS.answered && sessionContext.lastTopic;

  await updateChatState(sessionId, removeUndefinedFields({
    preferredStudyMode: response.studyMode,
    lastTutorAction: response.intent || route.intent,
    lastIntent: sessionContext.lastIntent || response.intent || route.intent,
    lastTopic: shouldSaveDoubtTopic ? sessionContext.lastTopic : undefined,
    lastDoubtTopic: shouldSaveDoubtContext ? sessionContext.lastTopic : undefined,
    lastDoubtQuestion: shouldSaveDoubtContext
      ? response.resolvedQuestion || question
      : undefined,
    lastDoubtSources: shouldSaveDoubtContext ? response.sources || [] : undefined,
    lastStudentMessage: question,
    lastAnswer: response.answer,
    lastSources: response.sources || [],
    ...stateUpdates,
  }));

  return response;
};

const validateStudyMode = (studyMode) => {
  if (!Object.values(STUDY_MODES).includes(studyMode)) {
    throw new ApiError(400, 'studyMode must be either "global" or "focus".');
  }
};

const validateGlobalRequest = (body) => {
  if (body.chapterId) {
    throw new ApiError(400, 'chapterId is allowed only when studyMode is "focus".');
  }
};

const validateFocusRequest = async (body) => {
  const chapterId = normalizeText(body.chapterId);

  if (!chapterId) {
    throw new ApiError(400, 'chapterId is required when studyMode is "focus".');
  }

  const chapter = await findStudyMapChapter(chapterId);

  if (!chapter) {
    throw new ApiError(404, `Chapter not found for chapterId: ${chapterId}`);
  }

  return chapter;
};

export const askQuestion = async (body = {}) => {
  const question = normalizeText(body.question);
  const studyMode = normalizeText(body.studyMode);
  const requestedSessionId = normalizeText(body.sessionId);

  if (!question) {
    throw new ApiError(400, 'question is required.');
  }

  validateStudyMode(studyMode);

  let chapter = null;
  let retrieverOptions = {};

  if (studyMode === STUDY_MODES.global) {
    validateGlobalRequest(body);
  } else {
    chapter = await validateFocusRequest(body);
    retrieverOptions = {
      metadataFilter: chapter.metadataFilter,
      requireTermMatchForLatinQuery: true,
    };
  }

  const dbSession = await getDbSession(requestedSessionId);
  const sessionId = normalizeSessionId(dbSession.sessionId);

  const chatState = await getOrCreateChatState(sessionId);
  loadDbStateIntoSession(sessionId, chatState);
  await addChatMessage({
    sessionId,
    role: 'student',
    text: question,
    metadata: {
      studyMode,
      chapterId: body.chapterId || null,
    },
  });

  const language = detectQuestionLanguage(question);
  const normalized = normalizeMessage(question);
  const sessionContext = getSessionContext(sessionId);
  const plan = await planTutorAction({
    normalized,
    sessionContext,
    chatState,
  });
  const actionResult = await executeTutorAction({
    plan,
    question,
    normalized,
    studyMode,
    language,
    sessionContext,
    chatState,
    retrieverOptions,
    focusChapter: chapter,
  });

  return saveTutorTurn({
    sessionId,
    question,
    response: actionResult.response,
    sessionContext: actionResult.sessionContext,
    route: actionResult.route,
    chatState,
    status: actionResult.status,
    stateUpdates: actionResult.stateUpdates,
  });
};
