import { detectConversationLanguage } from '../utils/languageDetector.js';
import { getStudyMap } from '../services/studyMap.service.js';
import {
  formatMemoryForPrompt,
  formatRecentHistory,
  formatStudyMapSummary,
  getLastTutorResponse,
} from './promptHelpers.js';
import { logContextSizes } from '../utils/tokenLogger.js';

/**
 * Focus mode constraints details mapping logic template generator.
 */
const buildFocusChapterPrompt = (focusChapter) => {
  if (!focusChapter) {
    return 'No focus chapter selected.';
  }
  return `${focusChapter.subjectTitle} > ${focusChapter.sectionTitle} > Ch ${focusChapter.number ?? '?'}: ${focusChapter.title}`;
};

/**
 * Turns cryptic database IDs (like ch_01, t_02) into readable curriculum titles,
 * so the Decider and Tutor LLM get the student's real context instead of raw IDs.
 */
const buildSemanticStudyContext = (chatState, studyMap) => {
  if (!chatState || !chatState.currentChapterId) {
    return 'No active study topic selected. Student is browsing globally or just initiated the conversation.';
  }

  let foundSubject = null;
  let foundSection = null;
  let foundChapter = null;

  const subjects = studyMap?.focusStudy?.subjects || [];
  for (const subj of subjects) {
    for (const sec of subj.sections || []) {
      const ch = (sec.chapters || []).find((c) => c.id === chatState.currentChapterId);
      if (ch) {
        foundSubject = subj.title;
        foundSection = sec.title;
        foundChapter = ch.title;
        break;
      }
    }
    if (foundChapter) break;
  }

  if (!foundChapter) {
    return `Active Chapter ID Reference: ${chatState.currentChapterId} | Mode Status: ${chatState.learningMode}`;
  }

  return `Active Subject Group: ${foundSubject} > ${foundSection} | Active Textbook Chapter: ${foundChapter} | Active Progress Topic: ${chatState.lastTopic || 'Chapter Initialization Open Segment'} | Learning Mode Status: ${chatState.learningMode}`;
};

/**
 * Step 3: Compiles all clean context text blocks required for downstream LLM decision steps.
 *
 * @param {object} input - Outputs forwarded from Step 1 validation
 * @param {object} session - Session elements context maps forwarded from Step 2
 * @returns {Promise<{ language, memory, history, lastTutorResponse, curriculumSummary, focusChapterPrompt, currentStudyContext }>}
 */
export const buildContext = async ({ question, focusChapter }, { chatState, recentMessages, sessionId }) => {
  console.log('step3.buildContext.js: Pre-processing contextual runtime serialization...');

  // Concurrent-safe curriculum initialization zone
  const studyMap = await getStudyMap();

  // 1. Evaluate user input script with languageDetector matrix
  const language = detectConversationLanguage({ question, recentMessages });
  console.log(`Language Verification Matrix -> Target Response Script: ${language.answerLanguage}`);

  // 2. Perform True Semantic Hydration for contextual stability
  const currentStudyContext = buildSemanticStudyContext(chatState, studyMap);
  console.log(`Semantic Hydration Map Output -> ${currentStudyContext}`);

  // 3. Serialize raw objects for prompt engines ingestion protocols
  const memory = JSON.stringify(formatMemoryForPrompt(chatState));
  const history = formatRecentHistory(recentMessages);
  const deciderHistory = formatRecentHistory(recentMessages.slice(-6));
  const lastTutorResponse = getLastTutorResponse(recentMessages);
  const curriculumSummary = formatStudyMapSummary(studyMap); // Isolated here (will be explicitly skipped from step 4 parameters)
  const focusChapterPrompt = buildFocusChapterPrompt(focusChapter);

  // STEP-0: Log approximate token sizes of every dynamic context component.
  // turnNumber = completed turns so far + 1 (messageCount increments after step7).
  const turnNumber = (chatState?.messageCount ?? 0) + 1;
  logContextSizes(sessionId, turnNumber, {
    history,
    lastTutorResponse,
    curriculumSummary,
    memory,
    focusChapterPrompt,
    currentStudyContext,
  });

  return {
    language,
    memory,
    history,
    deciderHistory,
    lastTutorResponse,
    curriculumSummary,
    focusChapterPrompt,
    currentStudyContext,
  };
};