import { generateRagAnswer } from '../../rag/query/answer/answerService.js';
import { INSUFFICIENT_CONTEXT_ANSWER } from '../../rag/query/prompts/tutorPrompt.js';
import { getStudyMap } from '../../services/studyMap.service.js';
import { getLessonResponse } from '../../services/lessonFlow.service.js';
import { createContextPatchFromAnswer, resolveQuestionWithContext } from '../context/contextResolver.js';
import { updateSessionContext } from '../context/sessionContextStore.js';
import { createClarificationResponse } from '../handlers/clarificationHandler.js';
import { createGreetingResponse } from '../handlers/greetingHandler.js';
import { createMetadataResponse } from '../handlers/metadataHandler.js';
import { ROUTER_CONFIDENCE, ROUTER_INTENTS } from '../router/routerIntents.js';
import { TUTOR_ACTIONS } from '../planner/tutorActions.js';

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

const formatApiSources = (sources) =>
  sources.map((source) => ({
    sourceNumber: source.sourceNumber,
    sourceId: source.sourceId,
    label: source.label,
    sourceTitle: source.sourceTitle,
    chapterTitle: source.chapterTitle || source.chapter_title,
    topicTitle: source.topicTitle,
    section: source.section,
    sectionTitle: source.sectionTitle || source.section,
    headingPath: source.headingPath || source.heading_path,
    chunkId: source.chunkId || source.chunk_id,
    chunkIds: source.chunkIds || [source.chunkId || source.chunk_id].filter(Boolean),
  }));

const getScope = ({ studyMode, chapter }) => {
  if (studyMode === 'global') {
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

const withSession = (response, sessionContext) => ({
  ...response,
  session: {
    sessionId: sessionContext.sessionId,
    turnCount: sessionContext.turnCount,
    lastTopic: sessionContext.lastTopic,
    lastDoubtTopic: sessionContext.lastDoubtTopic,
    lastSubject: sessionContext.lastSubject,
    lastSection: sessionContext.lastSection,
    lastChapterId: sessionContext.lastChapterId,
  },
});

const getStatus = ({ studyMode, result }) => {
  if (result.retrieval.results.length > 0 && !isContextNotFoundAnswer(result.answer)) {
    return STATUS.answered;
  }

  return studyMode === 'focus'
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

const getSectionFromStudyMap = async (sectionId) => {
  if (!sectionId) {
    return null;
  }

  const studyMap = await getStudyMap();

  for (const subject of studyMap.focusStudy.subjects || []) {
    const section = (subject.sections || []).find((item) => item.id === sectionId);

    if (section) {
      return {
        subject,
        section,
      };
    }
  }

  return null;
};

const formatChapterList = (chapters) =>
  chapters.map((chapter) => `${chapter.number}. ${chapter.title}`).join('\n');

const createLearningTargetResponse = async ({ question, studyMode, language, plan, sessionContext }) => {
  const matchedSection = await getSectionFromStudyMap(plan.target.sectionId);
  const route = plan.route;

  if (!matchedSection) {
    const response = createClarificationResponse({
      question,
      studyMode,
      language,
      route: {
        ...route,
        clarificationQuestion:
          'Aap kaunsa Science section padhna chahte ho? Physics, Chemistry, ya Biology likh do.',
      },
      sessionContext,
    });

    return {
      response,
      stateUpdates: {},
    };
  }

  const { subject, section } = matchedSection;

  return {
    response: {
      status: 'learning_target_set',
      intent: TUTOR_ACTIONS.setLearningTarget,
      confidence: plan.confidence,
      studyMode,
      question,
      detectedLanguage: language.detectedLanguage,
      answerLanguage: language.answerLanguage,
      answer: `${section.title} me ${section.chapters.length} chapters available hain:\n${formatChapterList(section.chapters)}\n\nKaunsa chapter start karein?`,
      sources: [],
      suggestedActions: [
        {
          type: 'choose_chapter',
          label: 'Choose chapter',
          subjectId: subject.id,
          sectionId: section.id,
        },
      ],
      scope: {
        subjectId: subject.id,
        subjectTitle: subject.title,
        sectionId: section.id,
        sectionTitle: section.title,
      },
      router: route,
    },
    stateUpdates: {
      currentSubjectId: subject.id,
      currentSectionId: section.id,
      currentChapterId: null,
      currentTopicId: null,
      learningMode: 'idle',
      pendingAction: 'choose_chapter',
      completedTopicIds: [],
      lastDoubtTopic: null,
      lastDoubtQuestion: null,
      lastDoubtSources: [],
    },
  };
};

const executeLessonAction = async ({ plan, question, normalized, studyMode, chatState }) => {
  const lessonResult = await getLessonResponse({
    question,
    normalizedText: normalized.normalizedText,
    studyMode,
    chatState,
    forceStart: plan.forceStart,
  });

  if (lessonResult) {
    return lessonResult;
  }

  return {
    response: {
      status: 'needs_clarification',
      intent: plan.action,
      confidence: plan.confidence,
      studyMode,
      question,
      answer: 'Aap kaunsa chapter start karna chahte ho? Jaise "chemistry chapter 4 padhao".',
      sources: [],
      suggestedActions: [],
      scope: null,
      router: plan.route,
    },
    stateUpdates: {},
  };
};

const executeDoubtAction = async ({
  plan,
  question,
  normalized,
  studyMode,
  language,
  sessionContext,
  chatState,
  retrieverOptions,
  focusChapter,
}) => {
  const route = plan.route;
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
    const nextSession = updateSessionContext(sessionContext.sessionId, {
      lastIntent: clarificationRoute.intent,
      lastQuestion: question,
    });

    return {
      response: withSession(
        createClarificationResponse({
          question,
          studyMode,
          language,
          route: clarificationRoute,
          sessionContext: nextSession,
        }),
        nextSession
      ),
      route: clarificationRoute,
      sessionContext: nextSession,
      stateUpdates: {},
    };
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
    scope: getScope({ studyMode, chapter: focusChapter }),
    router: route,
  };
  const contextPatch = createContextPatchFromAnswer({
    route,
    question: resolvedQuestion || normalized.normalizedText,
    answerPayload: response,
    scope: response.scope,
  });

  if (chatState.currentChapterId) {
    contextPatch.lastSubject = chatState.currentSubjectId;
    contextPatch.lastSection = chatState.currentSectionId;
    contextPatch.lastChapterId = chatState.currentChapterId;
  }

  const nextSession = updateSessionContext(sessionContext.sessionId, contextPatch);

  return {
    response: withSession(response, nextSession),
    route,
    sessionContext: nextSession,
    status,
    stateUpdates: {},
  };
};

export const executeTutorAction = async ({
  plan,
  question,
  normalized,
  studyMode,
  language,
  sessionContext,
  chatState,
  retrieverOptions,
  focusChapter,
}) => {
  const route = plan.route;

  if (plan.action === TUTOR_ACTIONS.respondSmalltalk) {
    const nextSession = updateSessionContext(sessionContext.sessionId, {
      lastIntent: route.intent,
      lastQuestion: question,
    });

    return {
      response: withSession(
        createGreetingResponse({ question, studyMode, language, route, sessionContext: nextSession }),
        nextSession
      ),
      route,
      sessionContext: nextSession,
      stateUpdates: {},
    };
  }

  if (plan.action === TUTOR_ACTIONS.askClarification) {
    const nextSession = updateSessionContext(sessionContext.sessionId, {
      lastIntent: route.intent,
      lastQuestion: question,
    });

    return {
      response: withSession(
        createClarificationResponse({ question, studyMode, language, route, sessionContext: nextSession }),
        nextSession
      ),
      route,
      sessionContext: nextSession,
      stateUpdates: {},
    };
  }

  if (plan.action === TUTOR_ACTIONS.setLearningTarget) {
    const learningTargetResult = await createLearningTargetResponse({
      question,
      studyMode,
      language,
      plan,
      sessionContext,
    });
    const nextSession = updateSessionContext(sessionContext.sessionId, {
      lastIntent: route.intent,
      lastQuestion: question,
      lastSubject: learningTargetResult.response.scope?.subjectId || sessionContext.lastSubject,
      lastSection: learningTargetResult.response.scope?.sectionId || sessionContext.lastSection,
    });

    return {
      response: withSession(learningTargetResult.response, nextSession),
      route,
      sessionContext: nextSession,
      stateUpdates: learningTargetResult.stateUpdates,
    };
  }

  if (plan.action === TUTOR_ACTIONS.answerMetadata) {
    const response = await createMetadataResponse({
      question,
      studyMode,
      language,
      route,
      sessionContext,
    });
    const nextSession = updateSessionContext(sessionContext.sessionId, {
      lastIntent: route.intent,
      lastQuestion: question,
      lastSubject: response.scope?.subjectId || route.subjectHint || sessionContext.lastSubject,
      lastSection: response.scope?.sectionId || route.sectionHint || sessionContext.lastSection,
    });

    return {
      response: withSession(response, nextSession),
      route,
      sessionContext: nextSession,
      stateUpdates: {},
    };
  }

  if (plan.action === TUTOR_ACTIONS.startLesson || plan.action === TUTOR_ACTIONS.continueLesson) {
    const lessonResult = await executeLessonAction({
      plan,
      question,
      normalized,
      studyMode,
      chatState,
    });
    const nextSession = updateSessionContext(sessionContext.sessionId, {
      lastIntent: lessonResult.response.intent,
      lastQuestion: question,
      lastSubject: lessonResult.response.scope?.subjectId || sessionContext.lastSubject,
      lastSection: lessonResult.response.scope?.sectionId || sessionContext.lastSection,
      lastChapterId: lessonResult.response.scope?.chapterId || sessionContext.lastChapterId,
      lastTopic: lessonResult.stateUpdates.lastTopic || sessionContext.lastTopic,
      lastAnswer: lessonResult.response.answer,
      lastSources: lessonResult.response.sources || [],
    });

    return {
      response: withSession(lessonResult.response, nextSession),
      route: lessonResult.response.router || route,
      sessionContext: nextSession,
      stateUpdates: lessonResult.stateUpdates,
    };
  }

  return executeDoubtAction({
    plan,
    question,
    normalized,
    studyMode,
    language,
    sessionContext,
    chatState,
    retrieverOptions,
    focusChapter,
  });
};
