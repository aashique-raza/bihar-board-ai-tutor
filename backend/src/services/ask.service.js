import { generateRagAnswer } from '../rag/query/answer/answerService.js';
import { INSUFFICIENT_CONTEXT_ANSWER } from '../rag/query/prompts/tutorPrompt.js';
import { getSessionContext, normalizeSessionId, saveSessionContext, updateSessionContext } from '../tutor/context/sessionContextStore.js';
import { createContextPatchFromAnswer, resolveQuestionWithContext } from '../tutor/context/contextResolver.js';
import { createClarificationResponse } from '../tutor/handlers/clarificationHandler.js';
import { createGreetingResponse } from '../tutor/handlers/greetingHandler.js';
import { createMetadataResponse } from '../tutor/handlers/metadataHandler.js';
import { createStudyIntentResponse } from '../tutor/handlers/studyIntentHandler.js';
import { normalizeMessage } from '../tutor/normalization/normalizeMessage.js';
import { routeMessage } from '../tutor/router/hybridRouter.js';
import { ROUTER_CONFIDENCE, ROUTER_INTENTS } from '../tutor/router/routerIntents.js';
import { detectQuestionLanguage } from '../utils/languageDetector.js';
import ApiError from '../utils/ApiError.js';
import { addChatMessage } from './chatHistory.service.js';
import { getOrCreateChatSession, createChatSession } from './chatSession.service.js';
import { getOrCreateChatState, updateChatState } from './chatState.service.js';
import { getLessonResponse } from './lessonFlow.service.js';
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

const FOCUS_CONTEXT_NOT_FOUND_ANSWER =
  'Mere paas selected chapter ke provided context me is question ka enough information nahi hai. Aap chaho to Global Mode me search kar sakte ho.';

const GLOBAL_CONTEXT_NOT_FOUND_ANSWER =
  'Mere paas provided Science content me is question ka enough information nahi hai.';

const FOCUS_CONTEXT_NOT_FOUND_ENGLISH_ANSWER =
  'I do not have enough information in the selected chapter context to answer this. You can search in Global Mode if you want.';

const GLOBAL_CONTEXT_NOT_FOUND_ENGLISH_ANSWER =
  'I do not have enough information in the provided Science content to answer this.';

const normalizeText = (value) => String(value || '').trim();

const getLearningMode = ({ route, status }) => {
  if (route.intent === 'start_lesson' || route.intent === 'continue_lesson') {
    return 'lesson';
  }

  if (route.intent === ROUTER_INTENTS.studyIntent) {
    return 'lesson';
  }

  if (status === STATUS.answered || route.intent === ROUTER_INTENTS.followUp) {
    return 'doubt';
  }

  return 'idle';
};

const getDbSession = async (requestedSessionId) => {
  if (requestedSessionId) {
    return getOrCreateChatSession(requestedSessionId);
  }

  return createChatSession();
};

const removeEmptyFields = (data) => {
  const cleanData = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
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

  await updateChatState(sessionId, removeEmptyFields({
    currentSubjectId: sessionContext.lastSubject || null,
    currentSectionId: sessionContext.lastSection || null,
    currentChapterId: sessionContext.lastChapterId || null,
    learningMode: getLearningMode({ route, status }),
    preferredStudyMode: response.studyMode,
    pendingAction: response.suggestedActions?.[0]?.type || null,
    lastTutorAction: response.intent || route.intent,
    lastIntent: sessionContext.lastIntent || response.intent || route.intent,
    lastTopic: sessionContext.lastTopic,
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

const isContextNotFoundAnswer = (answer) =>
  normalizeText(answer) === INSUFFICIENT_CONTEXT_ANSWER;

const getSuggestedActions = (status) => {
  if (status !== STATUS.focusContextNotFound) {
    return [];
  }

  return [
    {
      type: 'switch_to_global',
      label: 'Switch to Global Mode',
    },
    {
      type: 'cancel',
      label: 'Cancel',
    },
  ];
};

const getScope = ({ studyMode, chapter }) => {
  if (studyMode === STUDY_MODES.global) {
    return null;
  }

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    sectionId: chapter.sectionId,
    sectionTitle: chapter.sectionTitle,
    subjectId: chapter.subjectId,
    subjectTitle: chapter.subjectTitle,
  };
};

const formatApiSources = (sources) =>
  sources.map((source) => ({
    sourceNumber: source.sourceNumber,
    chapterTitle: source.chapterTitle || source.chapter_title,
    section: source.section,
    headingPath: source.headingPath || source.heading_path,
    chunkId: source.chunkId || source.chunk_id,
  }));

const withSession = (response, sessionContext) => ({
  ...response,
  session: {
    sessionId: sessionContext.sessionId,
    turnCount: sessionContext.turnCount,
    lastTopic: sessionContext.lastTopic,
    lastSubject: sessionContext.lastSubject,
    lastSection: sessionContext.lastSection,
    lastChapterId: sessionContext.lastChapterId,
  },
});

const getStatus = ({ studyMode, result }) => {
  if (result.retrieval.results.length > 0 && !isContextNotFoundAnswer(result.answer)) {
    return STATUS.answered;
  }

  return studyMode === STUDY_MODES.focus
    ? STATUS.focusContextNotFound
    : STATUS.globalContextNotFound;
};

const getAnswer = ({ status, result, answerLanguage }) => {
  if (status === STATUS.focusContextNotFound) {
    return answerLanguage === 'english'
      ? FOCUS_CONTEXT_NOT_FOUND_ENGLISH_ANSWER
      : FOCUS_CONTEXT_NOT_FOUND_ANSWER;
  }

  if (status === STATUS.globalContextNotFound) {
    return answerLanguage === 'english'
      ? GLOBAL_CONTEXT_NOT_FOUND_ENGLISH_ANSWER
      : GLOBAL_CONTEXT_NOT_FOUND_ANSWER;
  }

  return result.answer;
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
  const lessonResult = await getLessonResponse({
    question,
    normalizedText: normalized.normalizedText,
    studyMode,
    chatState,
  });

  if (lessonResult) {
    const route = lessonResult.response.router;
    const nextSession = updateSessionContext(sessionId, {
      lastIntent: lessonResult.response.intent,
      lastQuestion: question,
      lastSubject: lessonResult.response.scope?.subjectId || sessionContext.lastSubject,
      lastSection: lessonResult.response.scope?.sectionId || sessionContext.lastSection,
      lastChapterId: lessonResult.response.scope?.chapterId || sessionContext.lastChapterId,
      lastTopic: lessonResult.stateUpdates.lastTopic || sessionContext.lastTopic,
      lastAnswer: lessonResult.response.answer,
      lastSources: lessonResult.response.sources || [],
    });

    return saveTutorTurn({
      sessionId,
      question,
      response: withSession(lessonResult.response, nextSession),
      sessionContext: nextSession,
      route,
      stateUpdates: lessonResult.stateUpdates,
    });
  }

  const route = await routeMessage({
    normalized,
    sessionContext,
  });

  if (route.needsClarification || route.intent === ROUTER_INTENTS.unclear) {
    const nextSession = updateSessionContext(sessionId, {
      lastIntent: route.intent,
      lastQuestion: question,
    });

    const response = withSession(
      createClarificationResponse({
        question,
        studyMode,
        language,
        route,
        sessionContext: nextSession,
      }),
      nextSession
    );

    return saveTutorTurn({
      sessionId,
      question,
      response,
      sessionContext: nextSession,
      route,
    });
  }

  if (route.intent === ROUTER_INTENTS.greeting) {
    const nextSession = updateSessionContext(sessionId, {
      lastIntent: route.intent,
      lastQuestion: question,
    });

    const response = withSession(
      createGreetingResponse({
        question,
        studyMode,
        language,
        route,
        sessionContext: nextSession,
      }),
      nextSession
    );

    return saveTutorTurn({
      sessionId,
      question,
      response,
      sessionContext: nextSession,
      route,
    });
  }

  if (route.intent === ROUTER_INTENTS.studyIntent) {
    const nextSession = updateSessionContext(sessionId, {
      lastIntent: route.intent,
      lastQuestion: question,
      lastSubject: route.subjectHint || sessionContext.lastSubject,
      lastSection: route.sectionHint || sessionContext.lastSection,
    });

    const response = withSession(
      createStudyIntentResponse({
        question,
        studyMode,
        language,
        route,
        sessionContext: nextSession,
      }),
      nextSession
    );

    return saveTutorTurn({
      sessionId,
      question,
      response,
      sessionContext: nextSession,
      route,
    });
  }

  if (route.intent === ROUTER_INTENTS.metadataQuestion) {
    const response = await createMetadataResponse({
      question,
      studyMode,
      language,
      route,
      sessionContext,
    });
    const nextSession = updateSessionContext(sessionId, {
      lastIntent: route.intent,
      lastQuestion: question,
      lastSubject: response.scope?.subjectId || route.subjectHint || sessionContext.lastSubject,
      lastSection: response.scope?.sectionId || route.sectionHint || sessionContext.lastSection,
    });

    return saveTutorTurn({
      sessionId,
      question,
      response: withSession(response, nextSession),
      sessionContext: nextSession,
      route,
    });
  }

  const resolvedQuestion = resolveQuestionWithContext({
    normalized,
    route,
    sessionContext,
  });

  if (!resolvedQuestion && route.intent === ROUTER_INTENTS.followUp) {
    const clarificationRoute = {
      ...route,
      intent: ROUTER_INTENTS.unclear,
      confidence: Math.min(route.confidence, ROUTER_CONFIDENCE.medium),
      needsClarification: true,
      clarificationQuestion:
        'Aap kis topic ke baare me puch rahe ho? Topic ka naam likh do, jaise blood, cornea, ozone layer.',
    };
    const nextSession = updateSessionContext(sessionId, {
      lastIntent: clarificationRoute.intent,
      lastQuestion: question,
    });

    const response = withSession(
      createClarificationResponse({
        question,
        studyMode,
        language,
        route: clarificationRoute,
        sessionContext: nextSession,
      }),
      nextSession
    );

    return saveTutorTurn({
      sessionId,
      question,
      response,
      sessionContext: nextSession,
      route: clarificationRoute,
    });
  }

  const result = await generateRagAnswer(resolvedQuestion || normalized.normalizedText, {
    answerLanguage: language.answerLanguage,
    retrieverOptions,
  });
  const status = getStatus({ studyMode, result });
  const answer = getAnswer({ status, result, answerLanguage: language.answerLanguage });

  const response = {
    status,
    intent: route.intent,
    confidence: route.confidence,
    studyMode,
    question,
    normalizedQuestion: normalized.normalizedText,
    resolvedQuestion: resolvedQuestion || normalized.normalizedText,
    detectedLanguage: language.detectedLanguage,
    answerLanguage: language.answerLanguage,
    answer,
    sources: status === STATUS.answered ? formatApiSources(result.sources) : [],
    suggestedActions: getSuggestedActions(status),
    scope: getScope({ studyMode, chapter }),
    router: route,
  };
  const nextSession = updateSessionContext(
    sessionId,
    createContextPatchFromAnswer({
      route,
      question: resolvedQuestion || normalized.normalizedText,
      answerPayload: response,
      scope: response.scope,
    })
  );

  return saveTutorTurn({
    sessionId,
    question,
    response: withSession(response, nextSession),
    sessionContext: nextSession,
    route,
    status,
  });
};
