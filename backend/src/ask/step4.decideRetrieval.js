import { RunnableSequence } from '@langchain/core/runnables';
import { createChatModel } from '../llm/chatModel.js';
import { stringParser } from '../llm/stringParser.js';
import { deciderPrompt } from '../prompts/deciderPrompt.js';
import { parseJsonObject } from '../utils/jsonParser.js';

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

  // Search parameter text standardization guards
  const searchQuery = needsRetrieval
    ? String(decision.searchQuery || rawQuestion).replace(/\s+/g, ' ').trim()
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
  console.log('step4.decideRetrieval.js: Dispatching context metrics into Intent Mapping layer...');

  // Invoke the modular execution sequence pipeline concurrently
  const rawDecision = await getDeciderChain().invoke({
    message: question,
    currentStudyContext, // Brand new hydrated text layer from Step 3 fix
    lastTutorResponse,   // Anti loop repetition token block
    history,
    focusChapter: focusChapterPrompt
  });

  console.log('step4.decideRetrieval.js: Raw payload output captured. Parsing JSON string patterns...');

  // Parse structural elements via safe utility mechanisms
  const parsed = parseJsonObject(rawDecision, 'Retrieval intent classification decision maps');

  // Standardize the shape layout to isolate down pipelines components from hallucinations
  const finalDecision = normalizeDecision(parsed, question);

  console.log(`Router Execution Diagnostics -> Selected Intent: ${finalDecision.intent} | RAG Retrieval Action Required: ${finalDecision.needsRetrieval}`);

  return finalDecision;
};