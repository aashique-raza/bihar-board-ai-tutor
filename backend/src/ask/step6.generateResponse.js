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
import { logCallTokens, approxTokens } from '../utils/tokenLogger.js';
import { routeToIntentHandler } from './intentRouter.js';

// Provider-agnostic cache token extractor.
// Groq: promptTokensCached or cache_read_input_tokens
// OpenAI: prompt_tokens_details.cached_tokens (auto-active for prompts >1024 tokens)
// Gemini: separate API — always 0 here
const extractCacheTokens = (usage) => {
  const groqCached   = usage.promptTokensCached ?? usage.cache_read_input_tokens ?? 0;
  const openaiCached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return groqCached || openaiCached || 0;
};

// Extracts full token breakdown from LangChain's handleLLMEnd callback.
// Path is consistent across Groq, OpenAI, and Google GenAI providers.
const extractTokenBreakdown = (output) => {
  const usage = output?.llmOutput?.tokenUsage || {};
  const input = usage.promptTokens ?? 0;
  const out = usage.completionTokens ?? 0;
  return {
    input,
    output: out,
    total: usage.totalTokens ?? (input + out),
    cached: extractCacheTokens(usage),
  };
};

let responseChain = null;

const getResponseChain = () => {
  if (!responseChain) {
    responseChain = RunnableSequence.from([
      tutorResponsePrompt,
      createChatModel({ temperature: 0.3, maxTokens: 1500 }), // 1500 covers full science explanation across all providers including Gemini
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

// Curriculum list (~450 tokens) is only useful in specific turns.
// Sending it on every turn is the single largest avoidable waste in the prompt.
const needsCurriculum = (intent, responseMode, focusChapterPrompt, retrievedContext) => {
  // Redirect and conversation modes never reference curriculum — short replies only
  if (responseMode === 'redirect' || responseMode === 'conversation') return false;

  // CHOOSE_COURSE: LLM is explicitly instructed to list chapters from this field
  if (intent === 'CHOOSE_COURSE') return true;

  // EXPLAIN_MORE: re-explains a specific topic already in retrieval context — chapter list is noise
  if (intent === 'EXPLAIN_MORE') return false;

  // Global mode: student has no active chapter — curriculum is the only reference LLM has
  if (focusChapterPrompt === 'No focus chapter selected.') return true;

  // Focus mode + retrieval failed: LLM needs curriculum to redirect student gracefully
  if (retrievedContext === 'NO_RETRIEVED_CONTEXT') return true;

  // Focus mode + content retrieved: student is in a chapter, chapter list is noise
  return false;
};

/**
 * Step 6: Call the Tutor LLM to generate the student-facing answer.
 */
export const generateResponse = async (input, context, decision, retrieval) => {

  // NEW PATH: Intent Router (Phase 2.3/2.4)
  // Enable by setting USE_INTENT_ROUTER=true in backend/.env.
  // Legacy path below stays active while this is false (default).
  if (process.env.USE_INTENT_ROUTER === 'true') {
    const result = await routeToIntentHandler(input, context, decision, retrieval);
    return { ...result, answer: sectionsToAnswerText(result) };
  }

  // LEGACY PATH — destructure what the old code needs
  const { question } = input;
  const { language, memory, history, curriculumSummary, focusChapterPrompt } = context;
  const { responseMode, intent } = decision;
  const { retrievedContext } = retrieval;

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
  let capturedBreakdown = { input: 0, output: 0, total: 0 };

  try {
    const targetLanguageInstruction = getAnswerLanguageInstruction(language.answerLanguage);

    // FIXING EMITTED OBJECT BOUNDARIES: Safely stringify memory to prevent [object Object] tokens inside the prompt
    const serializedMemory = memory && typeof memory === 'object'
      ? JSON.stringify(memory, null, 2)
      : String(memory || 'No active state records.');

    const curriculumForPrompt = needsCurriculum(intent, responseMode, focusChapterPrompt, retrievedContext)
      ? curriculumSummary
      : 'Not needed for this response type.';

    const rawResponse = await getResponseChain().invoke(
      {
        message: question,
        answerLanguageInstruction: targetLanguageInstruction,
        responseMode,
        decision: JSON.stringify({ responseMode, intent }),
        memory: serializedMemory,
        history,
        curriculumSummary: curriculumForPrompt,
        focusChapter: focusChapterPrompt,
        retrievedContext,
      },
      {
        callbacks: [{
          handleLLMEnd: (output) => { capturedBreakdown = extractTokenBreakdown(output); },
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
      return { ...safeConversation, answer: sectionsToAnswerText(safeConversation), tokenUsage: capturedBreakdown.total };
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

    // STEP-0: Log tutor token breakdown + retrieved context size.
    logCallTokens('TUTOR', capturedBreakdown, {
      mode: responseMode,
      status: normalized.status,
      ctxTokens: approxTokens(retrievedContext),
    });

    console.log(`[Step 6 Success] Response structured. Status: ${normalized.status}`);

    return {
      ...normalized,
      answer: sectionsToAnswerText(normalized),
      tokenUsage: capturedBreakdown.total,
      tokenBreakdown: capturedBreakdown,
    };

  } catch (error) {
    const errorType = classifyProviderError(error);

    // Parse error — provider is alive, just output was bad.
    // Return fallback and let pipeline continue to Step 7.
    if (errorType === 'parse_error') {
      console.error('[Step 6] Parse error. Returning fallback response.', error.message);
      logCallTokens('TUTOR', capturedBreakdown, { mode: responseMode, status: 'PARSE_ERROR_FALLBACK' });
      responseChain = null;
      const fallback = createFallbackResponse({ responseMode });
      return {
        ...fallback,
        answer: sectionsToAnswerText(fallback),
        tokenUsage: capturedBreakdown.total,
        tokenBreakdown: capturedBreakdown,
      };
    }

    // Provider is down — reset singleton and throw to orchestrator
    console.error(`[Step 6] Provider error (${errorType}):`, error.message);
    responseChain = null;
    throw new ProviderUnavailableError(errorType, error.message);
  }
};