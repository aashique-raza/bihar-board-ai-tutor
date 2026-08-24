/**
 * intentRouter.js
 *
 * Phase 2.3/2.4 — Routes each intent to its own prompt + model config.
 * Called by step6.generateResponse.js when USE_INTENT_ROUTER=true.
 *
 * What this file does (read top to bottom):
 *   1. INTENT_CONFIG   — which prompt + temperature + maxTokens per intent
 *   2. HISTORY_WINDOW  — how many recent messages each intent needs
 *   3. getChain()      — creates (and caches) the LLM chain per intent, lazily
 *   4. buildPromptInput() — assembles exactly the variables each prompt needs
 *   5. routeToIntentHandler() — the main function, called from step6
 */

import { RunnableSequence }      from '@langchain/core/runnables';
import { greetingPrompt }          from '../prompts/intents/greetingPrompt.js';
import { redirectPrompt }          from '../prompts/intents/redirectPrompt.js';
import { unsafePrompt }            from '../prompts/intents/unsafePrompt.js';
import { chooseCoursePrompt }      from '../prompts/intents/chooseCoursePrompt.js';
import { explainMorePrompt }       from '../prompts/intents/explainMorePrompt.js';
import { conceptWithChunksPrompt, conceptNoChunksPrompt } from '../prompts/intents/conceptQuestionPrompt.js';
import { nextStepPrompt }          from '../prompts/intents/nextStepPrompt.js';
import { examInfoPrompt }          from '../prompts/intents/examInfoPrompt.js';
import { emotionalSupportPrompt }  from '../prompts/intents/emotionalSupportPrompt.js';
import { createChatModel }       from '../llm/chatModel.js';
import { stringParser }          from '../llm/stringParser.js';
import { parseJsonObject }       from '../utils/jsonParser.js';
import { getAnswerLanguageInstruction } from '../utils/languageDetector.js';
import { formatRecentHistory, formatCompressedHistory } from './promptHelpers.js';
import { logCallTokens }         from '../utils/tokenLogger.js';
import { ProviderUnavailableError, classifyProviderError } from '../utils/providerErrors.js';

const isDev = process.env.NODE_ENV !== 'production';

// ─── Phase 3: Drift tier → behavioral instruction for the GREETING prompt ────
//
// Tier 0: no instruction (normal warm response).
// Tier 1: gentle nudge toward studying.
// Tier 2: firm redirect — but emotional messages still get one line of empathy first.
const DRIFT_INSTRUCTIONS = {
  0: '',
  1: 'Behavior note: Student kai baar casual messages bhej chuka hai. Ek sentence mein briefly respond karo, phir clearly ek science topic padhne ke liye invite karo.',
  2: 'Behavior note: Student baar baar padhai se bhaag raha hai. Agar message emotional hai (exam stress, scared, tired) to sirf ek line empathy do phir study redirect. Agar sirf casual chat hai to directly 1-2 lines mein ek science topic suggest karo — aur kuch nahi.',
};

// ─── 1. Per-intent model config ───────────────────────────────────────────────
//
// temperature : how varied/creative the response is (0 = deterministic, 1 = very varied)
// maxTokens   : hard cap on response length — short for simple intents saves real tokens
//
//   GREETING  → high temp (0.5) so responses feel varied, not robotic
//   REDIRECT  → zero temp, tiny budget — it's always the same 1-line response
//   CONCEPT   → zero temp — factual, consistent answers from retrieved content
//
// CONCEPT_QUESTION is split into two dispatch keys (CONCEPT_QUESTION_WITH_CHUNKS /
// CONCEPT_QUESTION_NO_CHUNKS) resolved by resolveChainKey() below — see that function's
// comment for why. decision.intent stays 'CONCEPT_QUESTION' everywhere else; only
// getChain/buildPromptInput/HISTORY_WINDOW lookups use the resolved key.

const INTENT_CONFIG = {
  GREETING:                     { prompt: greetingPrompt,          temperature: 0.5, maxTokens: 300  },
  EMOTIONAL_SUPPORT:            { prompt: emotionalSupportPrompt,  temperature: 0.5, maxTokens: 350  },
  OUT_OF_CONTEXT:               { prompt: redirectPrompt,          temperature: 0,   maxTokens: 100  },
  UNSAFE_OR_ABUSIVE:            { prompt: unsafePrompt,            temperature: 0,   maxTokens: 100  },
  CHOOSE_COURSE:                { prompt: chooseCoursePrompt,      temperature: 0.2, maxTokens: 600  },
  EXPLAIN_MORE:                 { prompt: explainMorePrompt,       temperature: 0.3, maxTokens: 1500 },
  CONCEPT_QUESTION_WITH_CHUNKS: { prompt: conceptWithChunksPrompt, temperature: 0,   maxTokens: 1500 },
  CONCEPT_QUESTION_NO_CHUNKS:   { prompt: conceptNoChunksPrompt,   temperature: 0,   maxTokens: 300  },
  EXAM_INFO:                    { prompt: examInfoPrompt,          temperature: 0,   maxTokens: 600  },
  NEXT_STEP:                    { prompt: nextStepPrompt,          temperature: 0.1, maxTokens: 1200 },
};

// ─── 2. Per-intent history window ────────────────────────────────────────────
//
// How many recent messages to send. 0 = none (redirect/unsafe don't need context).
// Sending less history = fewer tokens per turn.

const HISTORY_WINDOW = {
  GREETING:                     4,
  EMOTIONAL_SUPPORT:            4,
  OUT_OF_CONTEXT:               0,
  UNSAFE_OR_ABUSIVE:            0,
  CHOOSE_COURSE:                4,
  EXPLAIN_MORE:                 6,
  CONCEPT_QUESTION_WITH_CHUNKS: 6,
  // No-chunks redirect doesn't reference history at all — 0 saves tokens, matches
  // the OUT_OF_CONTEXT/EXAM_INFO precedent for short, non-explanatory responses.
  CONCEPT_QUESTION_NO_CHUNKS:   0,
  EXAM_INFO:                    0,
  NEXT_STEP:                    2,
};

// ─── 3. Lazy chain cache ──────────────────────────────────────────────────────
//
// Each intent gets its own LLM chain, created only when first needed.
// Avoids initializing all 7 chains at server start.

const intentChains = new Map();

const getChain = (intent) => {
  if (!intentChains.has(intent)) {
    const config = INTENT_CONFIG[intent];
    intentChains.set(intent, RunnableSequence.from([
      config.prompt,
      createChatModel({ temperature: config.temperature, maxTokens: config.maxTokens }),
      stringParser,
    ]));
  }
  return intentChains.get(intent);
};

// ─── 4. Build prompt variables per intent ────────────────────────────────────
//
// Each intent prompt only accepts specific {variable} slots.
// This function sends ONLY what each prompt needs — nothing extra.

const buildPromptInput = (intent, input, context, retrieval) => {
  const { question }                                                                      = input;
  const { language, curriculumSummary, focusChapterPrompt, recentMessages = [], driftSignal, lastStudyResponse } = context;
  const { retrievedContext }                                                             = retrieval;

  const answerLang = getAnswerLanguageInstruction(language.answerLanguage, intent);
  const window     = HISTORY_WINDOW[intent] ?? 6;
  // Phase 5: use compressed history for all intents except EXPLAIN_MORE.
  // EXPLAIN_MORE needs the full last Zuno response for its variation mandate
  // ("never open with the same sentence/headings as your last explanation").
  const history    = window === 0
    ? ''
    : intent === 'EXPLAIN_MORE'
      ? formatRecentHistory(recentMessages.slice(-window))
      : formatCompressedHistory(recentMessages.slice(-window));

  switch (intent) {
    case 'GREETING': {
      const tier            = driftSignal?.tier ?? 0;
      const driftInstruction = DRIFT_INSTRUCTIONS[tier] ?? '';
      return { message: question, answerLanguageInstruction: answerLang, history, driftInstruction };
    }

    case 'EMOTIONAL_SUPPORT':
      return { message: question, answerLanguageInstruction: answerLang, history };

    case 'OUT_OF_CONTEXT':
    case 'UNSAFE_OR_ABUSIVE':
      // Simplest prompts — only need the message itself
      return { message: question };

    case 'CHOOSE_COURSE':
      return { message: question, answerLanguageInstruction: answerLang, curriculumSummary, history };

    case 'EXPLAIN_MORE':
      return { message: question, answerLanguageInstruction: answerLang, retrievedContext, history, lastStudyResponse: lastStudyResponse || 'No previous study explanation.' };

    case 'CONCEPT_QUESTION_WITH_CHUNKS':
      return { message: question, answerLanguageInstruction: answerLang, focusChapter: focusChapterPrompt, retrievedContext, history, lastStudyResponse: lastStudyResponse || 'No previous study explanation.' };

    case 'CONCEPT_QUESTION_NO_CHUNKS':
      // Minimal input — matches OUT_OF_CONTEXT/UNSAFE_OR_ABUSIVE pattern. No retrievedContext,
      // no history, no focusChapter: the prompt's only job is a short, honest redirect.
      return { message: question, answerLanguageInstruction: answerLang };

    case 'EXAM_INFO':
      return { message: question, answerLanguageInstruction: answerLang, retrievedContext };

    case 'NEXT_STEP':
      return { message: question, answerLanguageInstruction: answerLang, retrievedContext, history };

    default:
      // Unknown intent — use concept question inputs as safe fallback
      return { message: question, answerLanguageInstruction: answerLang, focusChapter: focusChapterPrompt, retrievedContext, history };
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Cleans up the sections array from LLM output.
const normalizeSections = (sections) => {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((s) => ({ heading: String(s?.heading || '').trim(), content: String(s?.content || '').trim() }))
    .filter((s) => s.heading || s.content)
    .slice(0, 5);
};

// Guard against the LLM literally echoing a prompt's example placeholder text
// instead of writing a real answer (e.g. "Explanation here" from
// conceptQuestionPrompt.js / nextStepPrompt.js). "Aage badhein" is deliberately
// excluded — that's a real hardcoded chip label, not a leaked placeholder.
const PLACEHOLDER_SIGNATURES = new Set([
  'explanation here',
  'section heading',
  'short topic title',
  'topic title from retrieved content',
  'simple hinglish question',
  'your hinglish question here',
]);

export const isPlaceholderResponse = (sections) =>
  sections.length > 0 &&
  sections.every((s) => PLACEHOLDER_SIGNATURES.has(s.content.trim().toLowerCase()));

// Reads token usage from the LangChain callback. Same pattern as step4 and step6.
const extractTokenBreakdown = (output) => {
  const usage    = output?.llmOutput?.tokenUsage || {};
  const inputTok = usage.promptTokens     ?? 0;
  const outTok   = usage.completionTokens ?? 0;
  const cached   = (usage.promptTokensCached ?? usage.cache_read_input_tokens ?? 0)
                 || (usage.prompt_tokens_details?.cached_tokens ?? 0);
  return { input: inputTok, output: outTok, total: usage.totalTokens ?? (inputTok + outTok), cached };
};

// Resolves CONCEPT_QUESTION to one of two prompt/config variants depending on whether
// step5 actually retrieved usable content. Every other intent passes through unchanged.
// decision.intent, logging, drift tracking, and step7's whitelists all keep seeing plain
// 'CONCEPT_QUESTION' — this resolved key exists ONLY to pick the prompt/chain/history-window.
const resolveChainKey = (intent, retrievedContext) => {
  if (intent !== 'CONCEPT_QUESTION') return intent;
  const hasChunks = Boolean(retrievedContext)
    && retrievedContext !== 'NO_RETRIEVED_CONTEXT'
    && retrievedContext !== 'CHAPTER_COMPLETE';
  return hasChunks ? 'CONCEPT_QUESTION_WITH_CHUNKS' : 'CONCEPT_QUESTION_NO_CHUNKS';
};

// ─── 5. Main dispatch function ────────────────────────────────────────────────

export const routeToIntentHandler = async (input, context, decision, retrieval, streamCallbacks = null, abortSignal = null) => {
  const { intent, responseMode } = decision;
  const chainKey = resolveChainKey(intent, retrieval.retrievedContext);

  // CHAPTER_COMPLETE: step5 signals the chapter is finished.
  // No LLM call needed — return a fixed completion message directly.
  if (retrieval.retrievedContext === 'CHAPTER_COMPLETE') {
    return {
      status:           'answered',
      responseMode:     'study_tutor',
      title:            'Quiz Time!',
      sections:         [{ heading: '', content: 'Saare topics ho gaye! Ab is chapter ka quiz do — 70% ya usse zyada laane par chapter complete hoga.' }],
      suggestedActions: [
        { type: 'start_gate_quiz', label: 'Quiz shuru karo' },
      ],
      memoryUpdate:     {},
      tokenUsage:       0,
      tokenBreakdown:   { input: 0, output: 0, total: 0, cached: 0 },
    };
  }

  // OUT-OF-FOCUS REDIRECT: topic found globally but not in student's focus chapter.
  // Deterministic response — no LLM call needed (same pattern as CHAPTER_COMPLETE above).
  if (retrieval.isOutOfFocusAnswer && intent === 'CONCEPT_QUESTION') {
    const chapterTitle = input.focusChapter?.hinglishTitle || input.focusChapter?.title || 'is chapter';
    if (isDev) console.log(`[IntentRouter] Out-of-focus answer detected for focus chapter: "${chapterTitle}"`);
    return {
      status:           'answered',
      responseMode:     'study_tutor',
      title:            'Yeh topic doosre chapter mein hai',
      sections:         [{ heading: '', content: `"${chapterTitle}" chapter mein yeh topic nahi milaa. Poore Science material mein search karne ke liye Global Mode use karo — wahan milega!` }],
      suggestedActions: [{ type: 'global_mode', label: 'Poore Science mein dhundho' }],
      memoryUpdate:     {},
      tokenUsage:       0,
      tokenBreakdown:   { input: 0, output: 0, total: 0, cached: 0 },
    };
  }

  // NO CHAPTER SELECTED: NEXT_STEP fired but there's no active chapter (Global Mode).
  // Deterministic response — no LLM call needed (same pattern as CHAPTER_COMPLETE above).
  // getNextTopic() returns 'no_chapter' status only when chatState.currentChapterId is
  // null, which never happens in a valid Focus Mode session — so this is safe to key
  // purely off the (retrievedContext, intent) pair without checking studyMode directly.
  if (retrieval.retrievedContext === 'NO_RETRIEVED_CONTEXT' && intent === 'NEXT_STEP') {
    return {
      status:           'answered',
      responseMode:     'study_tutor',
      title:            null,
      sections:         [{ heading: '', content: 'Abhi koi chapter select nahi hai, isliye "agla topic" dikha nahi sakte. Pehle ek chapter chuno, phir hum step by step aage badhenge!' }],
      suggestedActions: [
        { type: 'switch_chapter', label: 'Chapter chunein' },
        { type: 'global_mode',    label: 'Koi bhi sawaal poochho' },
      ],
      memoryUpdate:     {},
      tokenUsage:       0,
      tokenBreakdown:   { input: 0, output: 0, total: 0, cached: 0 },
    };
  }

  // Guard: unknown intent — should never happen (normalizeDecision in step4 guards this)
  if (!INTENT_CONFIG[chainKey]) {
    console.warn(`[IntentRouter] Unknown intent "${intent}" — falling back to CONCEPT_QUESTION`);
    return routeToIntentHandler(input, context, { ...decision, intent: 'CONCEPT_QUESTION' }, retrieval);
  }

  let capturedBreakdown = { input: 0, output: 0, total: 0, cached: 0 };

  try {
    const chain       = getChain(chainKey);
    const promptInput = buildPromptInput(chainKey, input, context, retrieval);

    if (streamCallbacks?.onStreamStart) {
      streamCallbacks.onStreamStart();
    }

    let rawResponse = '';
    const stream = await chain.stream(promptInput, {
      signal: abortSignal || undefined,
      callbacks: [{ handleLLMEnd: (out) => { capturedBreakdown = extractTokenBreakdown(out); } }],
    });

    for await (const chunk of stream) {
      rawResponse += chunk;
      if (streamCallbacks?.onToken) {
        streamCallbacks.onToken(chunk);
      }
    }

    const parsed = parseJsonObject(rawResponse, `IntentRouter [${chainKey}]`);

    // Guard 2: Title rescue — universal.
    // LLM sometimes puts the response text in "title" instead of sections[0].content.
    // If sections are empty but title has content, promote title to a section.
    let sections = normalizeSections(parsed.sections);
    if (!sections.length && String(parsed.title || '').trim()) {
      sections = [{ heading: '', content: String(parsed.title).trim() }];
    }

    // Guard: LLM echoed a prompt example's placeholder text verbatim (e.g. "Explanation
    // here") instead of a real answer. Fall back to the same curated message the
    // parse-error path below already uses — proven to render safely through step6→step7.
    if (isPlaceholderResponse(sections)) {
      console.error(`[IntentRouter] Placeholder leak for "${intent}" — falling back`);
      logCallTokens('TUTOR', capturedBreakdown, { mode: responseMode, intent, status: 'PLACEHOLDER_LEAK' });
      return {
        status:           'error',
        responseMode:     responseMode || 'study_tutor',
        title:            null,
        sections:         [{ heading: '', content: 'Thodi technical dikkat aayi. Apna sawaal ek baar aur poochho.' }],
        suggestedActions: [],
        memoryUpdate:     {},
        tokenUsage:       capturedBreakdown.total,
        tokenBreakdown:   capturedBreakdown,
      };
    }

    // Guard 1+3: GREETING and EMOTIONAL_SUPPORT must always return status="answered".
    // Prevents LLM from accidentally returning insufficient_context on non-academic messages.
    let status = String(parsed.status || 'answered').trim();
    if (intent === 'GREETING' || intent === 'EMOTIONAL_SUPPORT') {
      status = 'answered';
    }

    // Guard 4: Retrieved-content override (tutor flakiness fix).
    // CONCEPT_QUESTION/EXPLAIN_MORE sometimes say "insufficient_context" even though step5
    // already retrieved real, quality-checked chunks (past the reranker + out-of-focus
    // fallback) and the LLM itself produced a substantive answer. That is model confusion,
    // not a genuine content gap — a genuine gap already short-circuits earlier via
    // retrievedContext === 'NO_RETRIEVED_CONTEXT' (see step5/intentRouter CHAPTER_COMPLETE
    // and out-of-focus branches), which this guard deliberately excludes.
    const RETRIEVAL_BACKED_INTENTS = new Set(['CONCEPT_QUESTION', 'EXPLAIN_MORE']);
    const hasRealRetrievedContent =
      Boolean(retrieval.retrievedContext) &&
      retrieval.retrievedContext !== 'NO_RETRIEVED_CONTEXT' &&
      retrieval.retrievedContext !== 'CHAPTER_COMPLETE';
    const hasSubstantiveAnswer = sections.some((s) => s.content.length >= 50);

    if (
      RETRIEVAL_BACKED_INTENTS.has(intent) &&
      hasRealRetrievedContent &&
      hasSubstantiveAnswer &&
      ['insufficient_context', 'out_of_scope'].includes(status)
    ) {
      console.warn(`[IntentRouter Guard] ${intent} returned "${status}" despite retrieved content — overriding to "answered"`);
      status = 'answered';
    }

    const VALID_STATUSES = new Set(['answered', 'insufficient_context', 'needs_clarification', 'out_of_scope']);
    if (!VALID_STATUSES.has(status)) status = 'answered';

    const normalized = {
      status,
      responseMode:     parsed.responseMode ?? responseMode,
      title:            responseMode === 'conversation' ? null : (String(parsed.title || '').trim() || null),
      sections:         sections.length ? sections : [{ heading: '', content: 'Thodi technical dikkat aayi. Apna sawaal ek baar aur poochho.' }],
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions.slice(0, 4) : [],
      memoryUpdate:     (parsed.memoryUpdate && typeof parsed.memoryUpdate === 'object') ? parsed.memoryUpdate : {},
    };

    logCallTokens('TUTOR', capturedBreakdown, { mode: responseMode, intent });
    const chainLabel = chainKey !== intent ? ` (${chainKey})` : '';
    if (isDev) console.log(`[IntentRouter] ${intent}${chainLabel} → status:${normalized.status}`);

    return { ...normalized, tokenUsage: capturedBreakdown.total, tokenBreakdown: capturedBreakdown };

  } catch (error) {
    intentChains.delete(chainKey); // reset chain so it's rebuilt fresh on next request

    const errorType = classifyProviderError(error);

    if (error.name === 'AbortError' || error.message === 'Timeout') {
      throw error;
    }

    if (errorType === 'parse_error') {
      console.error(`[IntentRouter] Parse error for "${intent}":`, error.message);
      logCallTokens('TUTOR', capturedBreakdown, { mode: responseMode, intent, status: 'PARSE_ERROR' });
      return {
        status:           'error',
        responseMode:     responseMode || 'study_tutor',
        title:            null,
        sections:         [{ heading: '', content: 'Thodi technical dikkat aayi. Apna sawaal ek baar aur poochho.' }],
        suggestedActions: [],
        memoryUpdate:     {},
        tokenUsage:       capturedBreakdown.total,
        tokenBreakdown:   capturedBreakdown,
      };
    }

    throw new ProviderUnavailableError(errorType, error.message);
  }
};
