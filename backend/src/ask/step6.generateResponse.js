/**
 * step6.generateResponse.js — Step 6 of the Ask API flow
 *
 * WHAT IT DOES:
 *   This is the SECOND LLM call in the Ask API.
 *   The Tutor LLM generates the actual student-facing answer using:
 *   - The student's question
 *   - The Decider's routing decision (Step 4)
 *   - The retrieved study content (Step 5)
 *   - The conversation history and tutor memory (Step 2 & 3)
 *
 * RETURNS:
 *   A normalized tutor response object:
 *   { status, responseMode, title, sections, answer, suggestedActions, memoryUpdate }
 *
 *   - sections → array of { heading, content } blocks for the frontend to render
 *   - answer   → plain text version of sections joined together (for chat history)
 *   - memoryUpdate → what the LLM suggests to update in the tutor's state
 *
 * NOTE:
 *   The prompt for this LLM call is in src/prompts/tutorPrompt.js
 */

import { RunnableSequence } from '@langchain/core/runnables';

import { createChatModel } from '../llm/chatModel.js';
import { stringParser } from '../llm/stringParser.js';
import { tutorResponsePrompt } from '../prompts/tutorPrompt.js';
import { parseJsonObject } from '../utils/jsonParser.js';
import { getAnswerLanguageInstruction } from '../utils/languageDetector.js';
import { sectionsToAnswerText } from './promptHelpers.js';

// Lazy-initialized singleton — created once and reused across requests
let responseChain = null;

const getResponseChain = () => {
  if (!responseChain) {
    responseChain = RunnableSequence.from([
      tutorResponsePrompt, // formats the full tutor prompt
      createChatModel(),   // Groq/Gemini/OpenAI depending on LLM_PROVIDER env
      stringParser,        // converts AIMessage to plain string
    ]);
  }
  return responseChain;
};

/**
 * Normalizes the sections array from the LLM response.
 * Ensures each section has a heading and content, capped at 5 sections.
 */
const normalizeSections = (sections) => {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section) => ({
      heading: String(section?.heading || '').trim(),
      content: String(section?.content || '').trim(),
    }))
    .filter((section) => section.heading || section.content)
    .slice(0, 5);
};

/**
 * Creates a safe fallback response if the LLM returns unparseable output.
 * This ensures the API always returns something meaningful.
 */
const createFallbackResponse = ({ responseMode, message }) => ({
  status: responseMode === 'redirect' ? 'out_of_scope' : 'answered',
  responseMode,
  title: null,
  sections: [
    {
      heading: 'Zuno',
      content: responseMode === 'redirect'
        ? 'Main is topic me help nahi kar paunga. Main Class 10 padhane ke liye bana hoon.'
        : `Chalo, is par simple tareeke se kaam karte hain: ${message}`,
    },
  ],
  suggestedActions: [],
  memoryUpdate: {},
});

/**
 * Step 6: Call the Tutor LLM to generate the student-facing answer.
 *
 * @param {{ question }}                                  input     - From Step 1
 * @param {{ language, memory, history, lastTutorResponse, curriculumSummary, focusChapterPrompt }} context - From Step 3
 * @param {{ responseMode }}                              decision  - From Step 4
 * @param {{ retrievedContext }}                          retrieval - From Step 5
 * @returns {{ status, responseMode, title, sections, answer, suggestedActions, memoryUpdate }}
 */
export const generateResponse = async (
  { question },
  { language, memory, history, lastTutorResponse, curriculumSummary, focusChapterPrompt },
  { responseMode },
  { retrievedContext }
) => {
  // Call the Tutor LLM with all context
  const rawResponse = await getResponseChain().invoke({
    message: question,
    answerLanguageInstruction: getAnswerLanguageInstruction(language.answerLanguage),
    responseMode,
    decision: JSON.stringify({ responseMode }, null, 2),
    memory,
    history,
    lastTutorResponse,
    curriculumSummary,
    focusChapter: focusChapterPrompt,
    retrievedContext,
  });

  // Parse the JSON from the LLM response
  const parsed = parseJsonObject(rawResponse, 'Tutor response');

  // Normalize the sections array
  const sections = normalizeSections(parsed.sections);

  // Build the normalized response object
  const normalized = {
    status: ['answered', 'insufficient_context', 'needs_clarification', 'out_of_scope'].includes(parsed.status)
      ? parsed.status
      : 'answered',
    responseMode,
    title: parsed.title ? String(parsed.title).trim() : null,
    sections: sections.length ? sections : createFallbackResponse({ responseMode, message: question }).sections,
    suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.slice(0, 4) : [],
    memoryUpdate: parsed.memoryUpdate && typeof parsed.memoryUpdate === 'object'
      ? parsed.memoryUpdate
      : {},
  };

  return {
    ...normalized,
    // answer = sections joined as plain text (used for chat history and response)
    answer: sectionsToAnswerText(normalized),
  };
};
