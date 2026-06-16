/**
 * step6.generateResponse.js — Step 6 of the Ask API flow.
 * Generates the tutor's answer with the LLM. For non-academic intents
 * (greetings/small talk) it forces status to 'answered' to avoid a state mismatch.
 */

import { RunnableSequence } from '@langchain/core/runnables';
import { createChatModel } from '../llm/chatModel.js';
import { stringParser } from '../llm/stringParser.js';
import { tutorResponsePrompt } from '../prompts/tutorPrompt.js';
import { parseJsonObject } from '../utils/jsonParser.js';
import { getAnswerLanguageInstruction } from '../utils/languageDetector.js';
import { sectionsToAnswerText } from './promptHelpers.js';
import { ProviderUnavailableError, classifyProviderError } from '../utils/providerErrors.js';

// Extracts total token count from LangChain's handleLLMEnd callback output.
// Path is consistent across Groq, OpenAI, and Google GenAI providers.
const extractTokenCount = (output) =>
  output?.llmOutput?.tokenUsage?.totalTokens ?? 0;

let responseChain = null;

const getResponseChain = () => {
  if (!responseChain) {
    responseChain = RunnableSequence.from([
      tutorResponsePrompt,
      createChatModel({ temperature: 0.3 }), // Tutor needs variation; decider (step4) stays at 0
      stringParser,
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

// Returns context-appropriate fallback section content based on responseMode and status.
// Called when LLM response has empty or malformed sections — must NOT be a generic
// technical error for non-error modes (e.g. redirect should explain scope, not blame tech).
const getFallbackSections = (responseMode, status) => {
  if (responseMode === 'redirect' || status === 'out_of_scope') {
    return [{ heading: '', content: 'Yeh topic Class 10 Science ke scope se bahar hai. Koi Science sawaal poochho — main madad karunga!' }];
  }
  if (responseMode === 'conversation') {
    return [{ heading: '', content: 'Haan! Koi sawaal ho toh poochho ya koi topic choose karo — main yahan hun!' }];
  }
  // study_tutor mode or unknown — generic technical fallback
  return [{ heading: '', content: 'Thodi technical dikkat aayi. Apna sawaal ek baar aur poochho.' }];
};

// Creates a safe fallback response when LLM output cannot be parsed (parse errors only).
const createFallbackResponse = ({ responseMode }) => ({
  status: 'error',
  responseMode: responseMode || 'study_tutor',
  title: null,
  sections: getFallbackSections(responseMode, null),
  suggestedActions: [],
  memoryUpdate: {},
});

/**
 * Step 6: Call the Tutor LLM to generate the student-facing answer.
 */
export const generateResponse = async (
  { question },
  { language, memory, history, lastTutorResponse, curriculumSummary, focusChapterPrompt },
  { responseMode, intent },
  { retrievedContext }
) => {
  // CHAPTER_COMPLETE: skip the LLM entirely and return a fixed completion message
  if (retrievedContext === 'CHAPTER_COMPLETE') {
    const chapterCompleteResponse = {
      status: 'answered',
      responseMode: 'study_tutor',
      title: 'Chapter Complete!',
      sections: [{
        heading: '',
        content: 'Iss chapter ke saare topics cover ho gaye! Bahut badhiya padha tumne. Aage kya karna chahte ho — agla chapter shuru karein ya koi topic dobara dekhna hai?',
      }],
      suggestedActions: [],
      memoryUpdate: {},
    };
    return { ...chapterCompleteResponse, answer: sectionsToAnswerText(chapterCompleteResponse), tokenUsage: 0 };
  }

  console.log(`[Step 6 Execution] Invoking Tutor Generation Engine. Script Target: ${language.answerLanguage}`);

  // Declared outside try so catch block can read the value on parse errors
  let capturedTokens = 0;

  try {
    const targetLanguageInstruction = getAnswerLanguageInstruction(language.answerLanguage);

    // FIXING EMITTED OBJECT BOUNDARIES: Safely stringify memory to prevent [object Object] tokens inside the prompt
    const serializedMemory = memory && typeof memory === 'object'
      ? JSON.stringify(memory, null, 2)
      : String(memory || 'No active state records.');

    const rawResponse = await getResponseChain().invoke(
      {
        message: question,
        answerLanguageInstruction: targetLanguageInstruction,
        responseMode,
        decision: JSON.stringify({ responseMode, intent }, null, 2),
        memory: serializedMemory,
        history,
        lastTutorResponse,
        curriculumSummary,
        focusChapter: focusChapterPrompt,
        retrievedContext,
      },
      {
        callbacks: [{
          handleLLMEnd: (output) => { capturedTokens = extractTokenCount(output); },
        }],
      }
    );

    // Parse the JSON from the LLM response safely using fence removal utility
    const parsed = parseJsonObject(rawResponse, 'Tutor response payload');

    // Code guard: conversation mode should never return insufficient_context or out_of_scope.
    // If the LLM ignored the prompt instruction and fired the empty-context rule, catch it here.
    if (responseMode === 'conversation' && ['insufficient_context', 'out_of_scope'].includes(parsed.status)) {
      console.warn('[Step 6 Guard] Conversation mode but LLM returned', parsed.status, '— overriding with safe fallback');
      const safeConversation = {
        status: 'answered',
        responseMode: 'conversation',
        title: null,
        sections: getFallbackSections('conversation', null),
        suggestedActions: [],
        memoryUpdate: {},
      };
      return { ...safeConversation, answer: sectionsToAnswerText(safeConversation), tokenUsage: capturedTokens };
    }

    // Normalize the sections array structure cleanly
    let sections = normalizeSections(parsed.sections);

    // Rescue: LLM sometimes puts conversation response text in "title" instead of sections[0].content.
    // This happens when the LLM misreads the JSON contract for conversation mode.
    // If sections are empty but title has content, promote the title text into a section.
    if (!sections.length && parsed.title && String(parsed.title).trim()) {
      console.warn('[Step 6 Rescue] Empty sections but title has content — promoting title to section content');
      sections = [{ heading: '', content: String(parsed.title).trim() }];
    }

    // --- Intent status guard ---
    // If Step 4 marked this turn as conversational, force the status below so the
    // LLM's status field cannot leak the wrong state to the frontend.
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
      title: responseMode === 'conversation' ? null : (parsed.title ? String(parsed.title).trim() : null),
      sections: sections.length ? sections : getFallbackSections(responseMode, parsed.status),
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.slice(0, 4) : [],
      memoryUpdate: parsed.memoryUpdate && typeof parsed.memoryUpdate === 'object' ? parsed.memoryUpdate : {},
    };

    console.log(`[Step 6 Success] Response successfully structured. Final Status: ${normalized.status} | Tokens: ${capturedTokens}`);

    return {
      ...normalized,
      answer: sectionsToAnswerText(normalized),
      tokenUsage: capturedTokens,
    };

  } catch (error) {
    const errorType = classifyProviderError(error);

    // Parse error — provider is alive, just output was bad.
    // Return fallback and let pipeline continue to Step 7.
    if (errorType === 'parse_error') {
      console.error('[Step 6] Parse error. Returning fallback response.', error.message);
      responseChain = null; // reset singleton
      const fallback = createFallbackResponse({ responseMode });
      return {
        ...fallback,
        answer: sectionsToAnswerText(fallback),
        tokenUsage: capturedTokens,
      };
    }

    // Provider is down — reset singleton and throw to orchestrator
    console.error(`[Step 6] Provider error (${errorType}):`, error.message);
    responseChain = null;
    throw new ProviderUnavailableError(errorType, error.message);
  }
};