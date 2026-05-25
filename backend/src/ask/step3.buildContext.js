import { detectConversationLanguage } from '../utils/languageDetector.js';
import { getStudyMap } from '../services/studyMap.service.js';
import {
  formatMemoryForPrompt,
  formatRecentHistory,
  formatStudyMapSummary,
  getLastTutorResponse,
} from './promptHelpers.js';

/**
 * Focus mode constraints details mapping logic template generator.
 */
const buildFocusChapterPrompt = (focusChapter) => {
  if (!focusChapter) {
    return 'No focus chapter selected.';
  }

  return JSON.stringify({
    subjectId: focusChapter.subjectId,
    subjectTitle: focusChapter.subjectTitle,
    sectionId: focusChapter.sectionId,
    sectionTitle: focusChapter.sectionTitle,
    chapterId: focusChapter.id,
    chapterNumber: focusChapter.number,
    chapterTitle: focusChapter.title,
  }, null, 2);
};

/**
 * Senior Architecture Hack: Semantic Hydration Engine
 * Cryptic database IDs (jaise ch_01, t_02) ko core curriculum titles strings me hydrate karta hai.
 * Isse Decider aur Tutor LLM ko bache ka precise contextual status real-time me dikhta hai.
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
export const buildContext = async ({ question, focusChapter }, { chatState, recentMessages }) => {
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
  const memory = JSON.stringify(formatMemoryForPrompt(chatState), null, 2);
  const history = formatRecentHistory(recentMessages);
  const lastTutorResponse = getLastTutorResponse(recentMessages);
  const curriculumSummary = formatStudyMapSummary(studyMap); // Isolated here (will be explicitly skipped from step 4 parameters)
  const focusChapterPrompt = buildFocusChapterPrompt(focusChapter);

  return {
    language,
    memory,
    history,
    lastTutorResponse,
    curriculumSummary,
    focusChapterPrompt,
    currentStudyContext, // Brand new field appended to give human-readable semantic clues to LLMs
  };
};