import { RunnableSequence } from '@langchain/core/runnables';
import { createChatModel } from '../llm/chatModel.js';
import { getDeciderConfig } from '../llm/llm.config.js';
import { decisionSchema, DECISION_SCHEMA_NAME } from '../llm/decisionSchema.js';
import { deciderPrompt } from '../prompts/deciderPrompt.js';
import { ProviderUnavailableError, classifyProviderError } from '../utils/providerErrors.js';
import { logCallTokens } from '../utils/tokenLogger.js';

const isDev = process.env.NODE_ENV !== 'production';

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

// Pre-defined set of accepted target intent structures
const VALID_INTENTS = new Set([
  'UNSAFE_OR_ABUSIVE',
  'GREETING',
  'EMOTIONAL_SUPPORT',
  'CHOOSE_COURSE',
  'NEXT_STEP',
  'EXPLAIN_MORE',
  'CONCEPT_QUESTION',
  'EXAM_INFO',
  'OUT_OF_CONTEXT'
]);

const VALID_RESPONSE_MODES = new Set(['conversation', 'study_tutor', 'redirect']);

// Lazy-initialized singleton wrapper for memory caching stability
let deciderChain = null;

const getDeciderChain = () => {
  if (!deciderChain) {
    // ADR-011: withStructuredOutput makes the provider return a guaranteed
    // well-formed object matching decisionSchema. There is no free-text JSON to
    // scrape, so there is no parse-error fallback (which used to produce a false
    // "topic not in syllabus" reply — BUG-1). The `intent` enum in the schema
    // makes an unrecognised intent value impossible (BUG-2).
    // Decider uses DECIDER_PROVIDER/DECIDER_MODEL if set, else the global LLM_PROVIDER/LLM_MODEL.
    const model = createChatModel({ ...getDeciderConfig(), maxTokens: 350 });
    deciderChain = RunnableSequence.from([
      deciderPrompt,
      model.withStructuredOutput(decisionSchema, { name: DECISION_SCHEMA_NAME, strict: true }),
    ]);
  }
  return deciderChain;
};

/**
 * Normalizes the raw LLM JSON structure to guarantee mathematical certainty upstream.
 * Protects pipeline routing from hallucinations or rogue property updates.
 *
 * @param {object} decision - Parsed payload map straight from the LLM engine
 * @param {string} rawQuestion - Fallback text message string if data keys fail
 * @returns {object} Predictable, strict bounded schema definition map
 */
const normalizeDecision = (decision, rawQuestion) => {
  // Validate intent. With the decisionSchema `intent` enum (ADR-011) an
  // out-of-set value is not representable, so this branch should be unreachable.
  // If it ever fires (schema bypassed, provider switch), fall back to
  // CONCEPT_QUESTION — never GREETING: misrouting a real question to small talk
  // silently increments the drift counter toward a hard block (BUG-2).
  const isKnownIntent = VALID_INTENTS.has(decision.intent);
  if (!isKnownIntent) console.error(`[Step 4] Unknown intent "${decision.intent}" — should be impossible with the schema enum; defaulting to CONCEPT_QUESTION`);
  const intent = isKnownIntent ? decision.intent : 'CONCEPT_QUESTION';

  // Calculate deterministic contextual scoping tags
  const inScope = (intent !== 'OUT_OF_CONTEXT' && intent !== 'UNSAFE_OR_ABUSIVE');

  // Enforce rigid response mode allocations
  let responseMode = VALID_RESPONSE_MODES.has(decision.responseMode) ? decision.responseMode : 'study_tutor';
  if (!inScope) {
    responseMode = 'redirect';
  }

  // needsRetrieval is fully deterministic — only CONCEPT_QUESTION triggers RAG.
  // Not read from LLM output (lean prompt no longer returns this field).
  const needsRetrieval = (intent === 'CONCEPT_QUESTION' && inScope);

  const DEVANAGARI_PATTERN = /[ऀ-ॿ]/;
  const rawSearchQuery = String(decision.searchQuery || '').trim();

  // The decider's English translation of the student's question.
  //
  // Kept for EVERY intent (not just retrieving ones) so askOrchestrator's SafetyNet can probe
  // English even when the decider said OUT_OF_CONTEXT. Measured: raw Hinglish probes 0.59-0.69
  // (never fires at 0.70) while its English translation probes 0.71-0.85 (always fires).
  //
  // null here is meaningful: the decider is telling us this message needs no content lookup
  // (greeting, emotional, or an explicitly excluded topic). The SafetyNet respects that.
  const englishQuery =
    rawSearchQuery && !DEVANAGARI_PATTERN.test(rawSearchQuery)
      ? rawSearchQuery.replace(/\s+/g, ' ').trim()
      : null;

  // Retrieval query: ALWAYS prefer the English translation.
  //
  // The chunks in MongoDB are English. Searching them with raw Hinglish returns literally zero
  // results — not weak results, zero: retriever.js's passesFinalFilter() needs either a keyword
  // term-match (impossible across languages) or a vector score >= 0.70 (Hinglish tops out ~0.69).
  // Measured on 10 real student questions: raw Hinglish -> 0 chunks, English -> 5 chunks, 10/10.
  // The raw question stays as a fallback only for when the decider produced no usable English.
  let searchQuery = null;
  if (needsRetrieval) {
    if (englishQuery) {
      searchQuery = englishQuery;
    } else if (!DEVANAGARI_PATTERN.test(rawQuestion)) {
      searchQuery = rawQuestion.replace(/\s+/g, ' ').trim();
    } else {
      console.warn('[Step 4] No English searchQuery and raw question is Devanagari — skipping retrieval');
    }
  }

  // examEntity is only meaningful for EXAM_INFO — the specific subject/branch/chapter/unit
  // the decider identified, used by step5 to fetch a code-computed exact fact instead of
  // letting the tutor LLM compose the number itself (see examKnowledgeService.js).
  const examEntity = intent === 'EXAM_INFO' ? (String(decision.examEntity || '').trim() || null) : null;

  return {
    intent,
    inScope,
    needsRetrieval,
    responseMode,
    searchQuery,
    englishQuery,          // decider's English translation — used by SafetyNet even when intent is OUT_OF_CONTEXT
    examEntity,
    reason: String(decision.reason || 'Processed via structural normalizer normalization parameters.').trim()
  };
};

/**
 * Step 4: Executes the Brain Routing classification layer.
 * Resolves reference loops by reviewing historical semantic hydration hooks.
 *
 * @param {object} input - Outputs forwarded from Step 1 gateway checks
 * @param {string} input.question - Bounded student text query string
 * @param {object} context - Hydrated variables compiled elegantly inside Step 3
 * @param {string} context.memory - Clean stringified core chat state configurations
 * @param {string} context.history - Structured incremental tracking blocks textual context
 * @param {string} context.lastTutorResponse - Explicit previous message text nodes
 * @param {string} context.focusChapterPrompt - Focus boundaries schema blocks instructions
 * @param {string} context.currentStudyContext - True semantic hydrated textbook tracking indicator
 * @returns {Promise<{ intent: string, inScope: boolean, needsRetrieval: boolean, responseMode: string, searchQuery: string|null, reason: string }>}
 */
export const decideRetrieval = async ({ question }, { deciderHistory, language }, abortSignal = null) => {
  if (isDev) console.log('[Step 4] Running intent classifier...');

  let capturedBreakdown = { input: 0, output: 0, total: 0 };

  try {
    const decision = await getDeciderChain().invoke(
      {
        message: question,
        detectedLanguage: language?.detectedLanguage ?? 'hinglish',
        history: deciderHistory,
      },
      {
        signal: abortSignal || undefined,
        callbacks: [{
          handleLLMEnd: (output) => { capturedBreakdown = extractTokenBreakdown(output); },
        }],
      }
    );

    if (isDev) console.log('[Step 4] Classification received.');

    // `decision` is already a parsed object matching decisionSchema (ADR-011).
    const finalDecision = normalizeDecision(decision, question);

    // STEP-0: Log decider token breakdown.
    logCallTokens('DECIDER', capturedBreakdown, {
      intent: finalDecision.intent,
      RAG: finalDecision.needsRetrieval ? 'YES' : 'NO',
    });

    return { ...finalDecision, tokenUsage: capturedBreakdown.total, tokenBreakdown: capturedBreakdown };

  } catch (error) {
    // Reset singleton — prevents reusing a broken chain on next request
    deciderChain = null;

    if (error.name === 'AbortError' || error.message === 'Timeout') {
      throw error;
    }

    // ADR-011: there is no "malformed output" case any more — withStructuredOutput
    // guarantees the shape. Any error here is a genuine provider failure (rate
    // limit, auth, network, or a hard refusal). Throw so the orchestrator returns
    // an honest "try again shortly" message — never a false scope rejection.
    const errorType = classifyProviderError(error);
    console.error(`[Step 4] Decider call failed (${errorType}):`, error.message);
    throw new ProviderUnavailableError(errorType, error.message);
  }
};