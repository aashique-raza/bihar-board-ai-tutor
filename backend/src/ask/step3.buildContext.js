/**
 * step3.buildContext.js — Step 3 of the Ask API flow
 *
 * WHAT IT DOES:
 *   Prepares all the text "context" that the two LLM calls (Steps 4 and 6) will need.
 *   Nothing talks to the LLM here — this is pure data formatting.
 *
 *   Formats:
 *   - language     → detects if question is Hindi, Hinglish, or English
 *   - memory       → compact JSON of chat state (current chapter, topic, mode)
 *   - history      → recent conversation as "Student: ... / Zuno: ..." lines
 *   - lastTutorResponse → the last thing Zuno said (to avoid repetition)
 *   - curriculumSummary → list of all available chapters (Physics, Chemistry, Biology)
 *   - focusChapterPrompt → the focus chapter details (for Focus Mode), or "No focus chapter selected."
 *
 * RETURNS:
 *   { language, memory, history, lastTutorResponse, curriculumSummary, focusChapterPrompt }
 */

import { detectConversationLanguage } from '../utils/languageDetector.js';
import { getStudyMap } from '../services/studyMap.service.js';
import {
  formatMemoryForPrompt,
  formatRecentHistory,
  formatStudyMapSummary,
  getLastTutorResponse,
} from './promptHelpers.js';

/**
 * Converts a chapter object to a formatted JSON string for the LLM prompt.
 * Returns "No focus chapter selected." if no chapter is given.
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
 * Builds all the context strings needed for the LLM calls.
 *
 * @param {{ question, focusChapter }}     input   - From Step 1
 * @param {{ chatState, recentMessages }}  session - From Step 2
 * @returns {{ language, memory, history, lastTutorResponse, curriculumSummary, focusChapterPrompt }}
 */
export const buildContext = async ({ question, focusChapter }, { chatState, recentMessages }) => {
  // Load the study map (needed for curriculum summary in the prompt)
  const studyMap = await getStudyMap();

  // Detect whether student is writing in Hindi, Hinglish, or English
  const language = detectConversationLanguage({ question, recentMessages });

  // Format compact tutor state for the prompt (current chapter, mode, etc.)
  const memory = JSON.stringify(formatMemoryForPrompt(chatState), null, 2);

  // Format recent chat history as a readable conversation block
  const history = formatRecentHistory(recentMessages);

  // Get the last thing Zuno said (to avoid repeating the same wording)
  const lastTutorResponse = getLastTutorResponse(recentMessages);

  // Generate the available chapters summary for the curriculum overview
  const curriculumSummary = formatStudyMapSummary(studyMap);

  // Build the focus chapter prompt (JSON for Focus Mode, text for Global Mode)
  const focusChapterPrompt = buildFocusChapterPrompt(focusChapter);

  return {
    language,
    memory,
    history,
    lastTutorResponse,
    curriculumSummary,
    focusChapterPrompt,
  };
};
