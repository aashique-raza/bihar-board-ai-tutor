import { RunnableSequence } from '@langchain/core/runnables';
import { createChatModel } from '../llm/chatModel.js';
import { getDeciderConfig } from '../llm/llm.config.js';
import { stringParser } from '../llm/stringParser.js';
import { deciderPrompt } from '../prompts/deciderPrompt.js';
import { parseJsonObject } from '../utils/jsonParser.js';
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
    deciderChain = RunnableSequence.from([
      deciderPrompt,
      createChatModel({ ...getDeciderConfig(), maxTokens: 350 }), // Decider uses DECIDER_PROVIDER/DECIDER_MODEL if set, else falls back to global LLM_PROVIDER/LLM_MODEL
      stringParser,
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
  // Validate and fall back on fine-grained intent maps
  const isKnownIntent = VALID_INTENTS.has(decision.intent);
  if (!isKnownIntent) console.warn(`[Step 4] Unknown intent "${decision.intent}" — falling back to GREETING`);
  const intent = isKnownIntent ? decision.intent : 'GREETING';

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

  // The vector store is indexed in Hinglish/English, so a Devanagari searchQuery
  // would retrieve poorly. Detect it here and skip retrieval below if found.
  const DEVANAGARI_PATTERN = /[ऀ-ॿ]/;
  const rawSearchQuery = String(decision.searchQuery || '').trim();
  const isDevanagari = DEVANAGARI_PATTERN.test(rawSearchQuery);

  if (needsRetrieval && isDevanagari) {
    // The LLM ignored the instruction and returned a Devanagari searchQuery.
    // Skipping retrieval is better than a bad vector match.
    console.warn('[Step 4] searchQuery contains Devanagari script — skipping retrieval to prevent bad vector match');
  }

  const searchQuery = needsRetrieval && rawSearchQuery && !isDevanagari
    ? rawSearchQuery.replace(/\s+/g, ' ').trim()
    : null;

  return {
    intent,
    inScope,
    needsRetrieval,
    responseMode,
    searchQuery,
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

  // Declared outside try so catch block can read the value on parse errors
  // (LLM responded but output was malformed — tokens were still consumed)
  let capturedBreakdown = { input: 0, output: 0, total: 0 };

  try {
    const rawDecision = await getDeciderChain().invoke(
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

    if (isDev) console.log('[Step 4] Response received. Parsing...');

    const parsed = parseJsonObject(rawDecision, 'Step 4 intent decision');
    const finalDecision = normalizeDecision(parsed, question);

    // STEP-0: Log decider token breakdown.
    logCallTokens('DECIDER', capturedBreakdown, {
      intent: finalDecision.intent,
      RAG: finalDecision.needsRetrieval ? 'YES' : 'NO',
    });

    return { ...finalDecision, tokenUsage: capturedBreakdown.total, tokenBreakdown: capturedBreakdown };

  } catch (error) {
    // Reset singleton — prevents reusing a broken chain on next request
    deciderChain = null;

    const errorType = classifyProviderError(error);

    if (error.name === 'AbortError' || error.message === 'Timeout') {
      throw error;
    }

    // Parse error means the provider responded but output was malformed.
    // Safe to continue pipeline with a default decision.
    if (errorType === 'parse_error') {
      console.error('[Step 4] JSON parse failed. Using safe default decision.', error.message);
      logCallTokens('DECIDER', capturedBreakdown, { intent: 'PARSE_ERROR_FALLBACK' });
      return {
        intent: 'CONCEPT_QUESTION',
        inScope: true,
        needsRetrieval: false,
        responseMode: 'study_tutor',
        searchQuery: null,
        reason: 'Parse error fallback',
        tokenUsage: capturedBreakdown.total,
        tokenBreakdown: capturedBreakdown,
      };
    }

    // Provider is down — throw so orchestrator can handle it centrally
    console.error(`[Step 4] Provider error (${errorType}):`, error.message);
    throw new ProviderUnavailableError(errorType, error.message);
  }
};