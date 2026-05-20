import { loadCurriculumIndex } from '../curriculum/curriculumIndexStore.js';
import { resolveChapter } from '../curriculum/chapterResolver.js';
import { routeMessage } from '../router/hybridRouter.js';
import { createRoute, ROUTER_CONFIDENCE, ROUTER_INTENTS } from '../router/routerIntents.js';
import { TUTOR_ACTIONS, TUTOR_ACTION_VALUES } from './tutorActions.js';

const START_WORDS = ['padhao', 'padhna', 'padna', 'start', 'shuru', 'suruaat'];
const NEXT_WORDS = ['next', 'aage', 'continue', 'chalu rakho'];

const hasAnyWord = (text, words) =>
  words.some((word) => text.includes(word));

const hasChapterSignal = (text) =>
  /\bchapter\s+\d{1,2}\b/i.test(text) ||
  /\bchapter\s+(one|first|ek|pehla|pahla|two|second|do|dusra|three|third|teen|teesra|four|fourth|char|five|fifth|panch|six|sixth|chhe|seven|seventh|saat)\b/i.test(text);

const createPlan = ({
  action,
  route,
  confidence = route?.confidence || 0.8,
  target = {},
  reason = '',
  forceStart = false,
}) => {
  if (!TUTOR_ACTION_VALUES.has(action)) {
    throw new Error(`Unsupported tutor action: ${action}`);
  }

  return {
    action,
    confidence,
    route,
    target,
    forceStart,
    reason,
  };
};

const createLessonRoute = ({ intent, normalized, reason }) =>
  createRoute({
    intent,
    confidence: 0.95,
    source: 'tutor_planner',
    subjectHint: normalized.subjectHint,
    sectionHint: normalized.sectionHint,
    reason,
  });

export const planTutorAction = async ({ normalized, sessionContext, chatState }) => {
  const text = normalized.normalizedText;
  const wantsNext = hasAnyWord(text, NEXT_WORDS);
  const wantsStart = hasAnyWord(text, START_WORDS) || hasChapterSignal(text);
  const hasCurrentChapter = Boolean(chatState.currentChapterId);
  const curriculumIndex = await loadCurriculumIndex();
  const chapterMatch = resolveChapter(curriculumIndex, text);

  if (hasCurrentChapter && wantsNext) {
    const route = createLessonRoute({
      intent: TUTOR_ACTIONS.continueLesson,
      normalized,
      reason: 'Student wants to continue the saved lesson.',
    });

    return createPlan({
      action: TUTOR_ACTIONS.continueLesson,
      route,
      target: {
        chapterId: chatState.currentChapterId,
      },
      reason: route.reason,
    });
  }

  if (wantsStart && chapterMatch.status === 'resolved') {
    const route = createLessonRoute({
      intent: TUTOR_ACTIONS.startLesson,
      normalized,
      reason: 'Student wants to start a resolved chapter lesson.',
    });

    return createPlan({
      action: TUTOR_ACTIONS.startLesson,
      route,
      target: {
        chapterId: chapterMatch.chapter.chapterId,
      },
      forceStart: true,
      reason: route.reason,
    });
  }

  if (wantsStart && hasChapterSignal(text) && chatState.currentSectionId) {
    const route = createLessonRoute({
      intent: TUTOR_ACTIONS.startLesson,
      normalized,
      reason: 'Student selected a chapter number after choosing a section.',
    });

    return createPlan({
      action: TUTOR_ACTIONS.startLesson,
      route,
      target: {
        sectionId: chatState.currentSectionId,
      },
      forceStart: true,
      reason: route.reason,
    });
  }

  const route = await routeMessage({
    normalized,
    sessionContext,
  });

  if (route.needsClarification || route.intent === ROUTER_INTENTS.unclear) {
    return createPlan({
      action: TUTOR_ACTIONS.askClarification,
      route,
      confidence: Math.min(route.confidence, ROUTER_CONFIDENCE.medium),
      reason: route.reason,
    });
  }

  if (route.intent === ROUTER_INTENTS.greeting) {
    return createPlan({
      action: TUTOR_ACTIONS.respondSmalltalk,
      route,
      reason: route.reason,
    });
  }

  if (route.intent === ROUTER_INTENTS.studyIntent) {
    return createPlan({
      action: TUTOR_ACTIONS.setLearningTarget,
      route,
      target: {
        subjectId: route.subjectHint,
        sectionId: route.sectionHint,
      },
      reason: route.reason,
    });
  }

  if (route.intent === ROUTER_INTENTS.metadataQuestion) {
    return createPlan({
      action: TUTOR_ACTIONS.answerMetadata,
      route,
      reason: route.reason,
    });
  }

  if (route.intent === ROUTER_INTENTS.followUp || route.intent === ROUTER_INTENTS.ragQuestion) {
    return createPlan({
      action: TUTOR_ACTIONS.answerDoubt,
      route,
      reason: route.reason,
    });
  }

  return createPlan({
    action: TUTOR_ACTIONS.answerDoubt,
    route,
    reason: 'Defaulting to grounded doubt answer.',
  });
};
