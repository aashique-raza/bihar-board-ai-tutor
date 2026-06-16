import { RunnableSequence } from '@langchain/core/runnables';
import { createChatModel } from '../llm/chatModel.js';
import { stringParser } from '../llm/stringParser.js';
import { deciderPrompt } from '../prompts/deciderPrompt.js';
import { parseJsonObject } from '../utils/jsonParser.js';
import { ProviderUnavailableError, classifyProviderError } from '../utils/providerErrors.js';

// Extracts total token count from LangChain's handleLLMEnd callback output.
// Path is consistent across Groq, OpenAI, and Google GenAI providers.
const extractTokenCount = (output) =>
  output?.llmOutput?.tokenUsage?.totalTokens ?? 0;

// Pre-defined set of accepted target intent structures
const VALID_INTENTS = new Set([
  'UNSAFE_OR_ABUSIVE',
  'GREETING',
  'CHOOSE_COURSE',
  'NEXT_STEP',
  'EXPLAIN_MORE',
  'CONCEPT_QUESTION',
  'OUT_OF_CONTEXT'
]);

const VALID_RESPONSE_MODES = new Set(['conversation', 'study_tutor', 'redirect']);

// Lazy-initialized singleton wrapper for memory caching stability
let deciderChain = null;

const getDeciderChain = () => {
  if (!deciderChain) {
    deciderChain = RunnableSequence.from([
      deciderPrompt,     // Hydrates multi-block metadata inputs into structure fields
      createChatModel(), // Resolves the active model provider dynamically from env settings
      stringParser,      // Clean serialization converter from AIMessage payload strings
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
  const intent = VALID_INTENTS.has(decision.intent) ? decision.intent : 'CONCEPT_QUESTION';

  // Calculate deterministic contextual scoping tags
  const inScope = (intent !== 'OUT_OF_CONTEXT' && intent !== 'UNSAFE_OR_ABUSIVE');

  // Enforce rigid response mode allocations
  let responseMode = VALID_RESPONSE_MODES.has(decision.responseMode) ? decision.responseMode : 'study_tutor';
  if (!inScope) {
    responseMode = 'redirect';
  }

  // Strict retrieval lock rules integration block
  // True structural RAG can only occur if the query is a genuine conceptual student question
  const needsRetrieval = (intent === 'CONCEPT_QUESTION' && inScope) ? Boolean(decision.needsRetrieval) : false;

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
export const decideRetrieval = async ({ question }, { history, lastTutorResponse, focusChapterPrompt, currentStudyContext }) => {
  console.log('[Step 4] Running intent classifier...');

  // Declared outside try so catch block can read the value on parse errors
  // (LLM responded but output was malformed — tokens were still consumed)
  let capturedTokens = 0;

  try {
    const rawDecision = await getDeciderChain().invoke(
      {
        message: question,
        currentStudyContext,
        lastTutorResponse,
        history,
        focusChapter: focusChapterPrompt,
      },
      {
        callbacks: [{
          handleLLMEnd: (output) => { capturedTokens = extractTokenCount(output); },
        }],
      }
    );

    console.log('[Step 4] Response received. Parsing...');

    const parsed = parseJsonObject(rawDecision, 'Step 4 intent decision');
    const finalDecision = normalizeDecision(parsed, question);

    console.log(`[Step 4] Intent: ${finalDecision.intent} | Needs RAG: ${finalDecision.needsRetrieval} | Tokens: ${capturedTokens}`);

    return { ...finalDecision, tokenUsage: capturedTokens };

  } catch (error) {
    // Reset singleton — prevents reusing a broken chain on next request
    deciderChain = null;

    const errorType = classifyProviderError(error);

    // Parse error means the provider responded but output was malformed.
    // Safe to continue pipeline with a default decision.
    if (errorType === 'parse_error') {
      console.error('[Step 4] JSON parse failed. Using safe default decision.', error.message);
      return {
        intent: 'CONCEPT_QUESTION',
        inScope: true,
        needsRetrieval: false, // safer — avoids unnecessary RAG call
        responseMode: 'study_tutor',
        searchQuery: null,
        reason: 'Parse error fallback',
        tokenUsage: capturedTokens,
      };
    }

    // Provider is down — throw so orchestrator can handle it centrally
    console.error(`[Step 4] Provider error (${errorType}):`, error.message);
    throw new ProviderUnavailableError(errorType, error.message);
  }
};