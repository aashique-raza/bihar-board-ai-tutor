/**
 * step6.generateResponse.js — Step 6 of the Ask API flow
 * * UPGRADED ROBUST LLM GENERATION WITH CONVERSATIONAL INTENT FIREWALL GATES
 * * FIXES: State mismatch bug by forcing status 'answered' on non-academic intents.
 */

import { RunnableSequence } from '@langchain/core/runnables';
import { createChatModel } from '../llm/chatModel.js';
import { stringParser } from '../llm/stringParser.js';
import { tutorResponsePrompt } from '../prompts/tutorPrompt.js';
import { parseJsonObject } from '../utils/jsonParser.js';
import { getAnswerLanguageInstruction } from '../utils/languageDetector.js';
import { sectionsToAnswerText } from './promptHelpers.js';

let responseChain = null;

const getResponseChain = () => {
  if (!responseChain) {
    responseChain = RunnableSequence.from([
      tutorResponsePrompt, // Formats the full tutor prompt
      createChatModel(),   // Groq/Gemini/OpenAI depending on env
      stringParser,        // Converts AIMessage to plain string
    ]);
  }
  return responseChain;
};

/**
 * Normalizes the sections array from the LLM response safely.
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
 * Creates an authentic localized fallback response if the LLM fails or hits syntax errors.
 */
const createFallbackResponse = ({ responseMode, message }) => ({
  status: ['GREETING', 'CONVERSATION'].includes(responseMode?.toUpperCase()) ? 'answered' : 'insufficient_context',
  responseMode,
  title: null,
  sections: [
    {
      heading: 'Zuno Help',
      content: responseMode === 'redirect'
        ? 'Babu, hum abhi is topic me madad nahi kar payenge. Hum bas aapke Class 10 ke board syllabus ko simple banane ke liye hain.'
        : `Chalo beta, isko ek baar fir se thode aasan dhang se samajhte hain. Aapne pucha: ${message}`,
    },
  ],
  suggestedActions: [],
  memoryUpdate: {},
});

/**
 * Step 6: Call the Tutor LLM to generate the student-facing answer.
 */
export const generateResponse = async (
  { question },
  { language, memory, history, lastTutorResponse, curriculumSummary, focusChapterPrompt },
  { responseMode },
  { retrievedContext }
) => {
  console.log(`[Step 6 Execution] Invoking Tutor Generation Engine. Script Target: ${language.answerLanguage}`);

  try {
    const targetLanguageInstruction = getAnswerLanguageInstruction(language.answerLanguage);

    // FIXING EMITTED OBJECT BOUNDARIES: Safely stringify memory to prevent [object Object] tokens inside the prompt
    const serializedMemory = memory && typeof memory === 'object'
      ? JSON.stringify(memory, null, 2)
      : String(memory || 'No active state records.');

    const rawResponse = await getResponseChain().invoke({
      message: question,
      answerLanguageInstruction: targetLanguageInstruction,
      responseMode,
      decision: JSON.stringify({ responseMode }, null, 2),
      memory: serializedMemory,
      history,
      lastTutorResponse,
      curriculumSummary,
      focusChapter: focusChapterPrompt,
      retrievedContext,
    });

    // Parse the JSON from the LLM response safely using fence removal utility
    const parsed = parseJsonObject(rawResponse, 'Tutor response payload');

    // Normalize the sections array structure cleanly
    const sections = normalizeSections(parsed.sections);

    // --- SENIOR INTENT ENFORCEMENT FIREWALL GATES ---
    // If Step 4 marked this as conversational, the code overrides the status to prevent prompt leakages.
    let targetStatus = parsed.status ? String(parsed.status).trim() : 'answered';
    const normalizedIntent = String(responseMode || '').toUpperCase();

    if (['GREETING', 'CONVERSATION', 'GREETINGS'].includes(normalizedIntent)) {
      console.log(`[Step 6 Intent Firewall] Forcing status 'answered' for conversational intent: ${responseMode}`);
      targetStatus = 'answered';
    } else {
      // Academic questions standard normalization limits
      targetStatus = ['answered', 'insufficient_context', 'needs_clarification', 'out_of_scope'].includes(targetStatus)
        ? targetStatus
        : 'answered';
    }

    // Build the fully compliant normalized response block structure
    const normalized = {
      status: targetStatus,
      responseMode,
      title: parsed.title ? String(parsed.title).trim() : null,
      sections: sections.length ? sections : createFallbackResponse({ responseMode, message: question }).sections,
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.slice(0, 4) : [],
      memoryUpdate: parsed.memoryUpdate && typeof parsed.memoryUpdate === 'object' ? parsed.memoryUpdate : {},
    };

    console.log(`[Step 6 Success] Response successfully structured. Final Status: ${normalized.status}`);

    return {
      ...normalized,
      answer: sectionsToAnswerText(normalized),
    };

  } catch (error) {
    console.error(`[Step 6 Runtime Exception] Generation parsing pipeline crashed: ${error.message}`);
    const fallback = createFallbackResponse({ responseMode, message: question });
    return {
      ...fallback,
      answer: sectionsToAnswerText(fallback),
    };
  }
};