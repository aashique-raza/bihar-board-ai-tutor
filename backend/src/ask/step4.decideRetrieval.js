/**
 * step4.decideRetrieval.js — Step 4 of the Ask API flow
 *
 * WHAT IT DOES:
 *   This is the FIRST LLM call in the Ask API.
 *   The LLM acts as a routing brain — it does NOT write the answer,
 *   it only makes three small decisions:
 *
 *   1. Is this question in scope? (inScope: true/false)
 *   2. Is RAG content retrieval needed? (needsRetrieval: true/false)
 *   3. What search query should be used? (searchQuery: string or null)
 *
 * RESPONSE MODES:
 *   "conversation"  → greeting, thanks, motivation, identity (no RAG needed)
 *   "study_tutor"   → science questions, explanations, doubts (RAG needed)
 *   "redirect"      → out-of-scope request (no RAG, redirect to Science)
 *
 * RETURNS:
 *   { inScope, needsRetrieval, responseMode, searchQuery, reason }
 *
 * NOTE:
 *   The prompt for this LLM call is in src/prompts/deciderPrompt.js
 */

import { RunnableSequence } from '@langchain/core/runnables';

import { createChatModel } from '../llm/chatModel.js';
import { stringParser } from '../llm/stringParser.js';
import { deciderPrompt } from '../prompts/deciderPrompt.js';
import { parseJsonObject } from '../utils/jsonParser.js';

// Lazy-initialized singleton — created once and reused across requests
let deciderChain = null;

const getDeciderChain = () => {
  if (!deciderChain) {
    deciderChain = RunnableSequence.from([
      deciderPrompt,   // formats the prompt with student message + context
      createChatModel(), // Groq/Gemini/OpenAI depending on LLM_PROVIDER env
      stringParser,    // converts AIMessage to plain string
    ]);
  }
  return deciderChain;
};

/**
 * Normalizes the LLM's raw JSON decision to a safe, predictable shape.
 * Guards against unexpected values from the LLM.
 */
const normalizeDecision = (decision, message) => {
  const responseMode = ['conversation', 'study_tutor', 'redirect'].includes(decision.responseMode)
    ? decision.responseMode
    : 'study_tutor';
  const inScope = Boolean(decision.inScope);
  const needsRetrieval = inScope && responseMode === 'study_tutor'
    ? Boolean(decision.needsRetrieval)
    : false;
  const searchQuery = needsRetrieval
    ? String(decision.searchQuery || message).trim()
    : null;

  return {
    inScope,
    needsRetrieval,
    responseMode: inScope ? responseMode : 'redirect',
    searchQuery,
    reason: String(decision.reason || '').trim(),
  };
};

/**
 * Step 4: Calls the Decider LLM to determine routing and retrieval.
 *
 * @param {{ question }}              input   - From Step 1
 * @param {{ memory, history, curriculumSummary, focusChapterPrompt }} context - From Step 3
 * @returns {{ inScope, needsRetrieval, responseMode, searchQuery, reason }}
 */
export const decideRetrieval = async ({ question }, { memory, history, curriculumSummary, focusChapterPrompt }) => {
  // Call the Decider LLM
  const rawDecision = await getDeciderChain().invoke({
    message: question,
    memory,
    history,
    curriculumSummary,
    focusChapter: focusChapterPrompt,
  });

  // Parse the JSON from the LLM response (handles markdown code fences, etc.)
  const parsed = parseJsonObject(rawDecision, 'Retrieval decision');

  // Normalize to a safe, predictable shape
  return normalizeDecision(parsed, question);
};
