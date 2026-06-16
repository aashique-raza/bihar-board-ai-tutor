/**
 * askOrchestrator.js
 *
 * ============================================================
 * THE MAIN ASK API FLOW — START HERE TO UNDERSTAND THE SYSTEM
 * ============================================================
 *
 * When a student sends a question (POST /api/v1/ask), this file runs.
 * It calls 7 steps in order. Each step is its own small file.
 *
 * FLOW:
 *
 *   Step 1 → validateInput.js     Validate question, studyMode, chapterId
 *   Step 2 → loadSession.js       Load/create session, state, history from MongoDB
 *   Step 3 → buildContext.js      Detect language, format memory + history for LLM
 *   Step 4 → decideRetrieval.js   LLM Decider: is this in scope? does it need RAG?  ← 1st LLM call
 *   Step 5 → retrieveContent.js   Vector search + rerank (if Step 4 said needsRetrieval=true)
 *   Step 6 → generateResponse.js  Tutor LLM: generate the student-facing answer     ← 2nd LLM call
 *   Step 7 → saveAndRespond.js    Save to MongoDB, build and return the API response
 *
 * READING TIP FOR JUNIOR DEVELOPERS:
 *   If you want to understand any specific part, open the step file directly.
 *   Each step file has comments explaining what it does, what it returns, and why.
 */

import { validateInput } from './step1.validateInput.js';
import { loadSession } from './step2.loadSession.js';
import { buildContext } from './step3.buildContext.js';
import { decideRetrieval } from './step4.decideRetrieval.js';
import { retrieveContent } from './step5.retrieveContent.js';
import { generateResponse } from './step6.generateResponse.js';
import { saveAndRespond } from './step7.saveAndRespond.js';
import {
  ProviderUnavailableError,
  getEffectiveErrorCount,
  getProviderErrorMessage,
  buildProviderErrorResponse,
} from '../utils/providerErrors.js';
import { updateChatSessionState } from '../services/chatSession.service.js';

/**
 * Main Ask API handler.
 * Called by ask.controller.js → ask.routes.js → POST /api/v1/ask
 *
 * @param {object} body - Raw request body { question, studyMode, sessionId, chapterId }
 * @returns {object}    - The complete API response payload
 */
export const askQuestion = async (body = {}, { userId = null } = {}) => {

  // --- PRE-PIPELINE: Steps 1-3 ---
  // These steps handle input validation, DB session load, and context building.
  // If these fail it is likely a DB outage or config issue — not a provider error.
  let input, session, context;

  try {
    input = await validateInput(body);
    session = await loadSession(input);
    context = await buildContext(input, session);
  } catch (error) {
    // Session-level blocks (exhausted, banned) surface as ApiError with a student-readable message.
    // Pass them through directly — do NOT replace with the generic technical error.
    if (error.statusCode === 429 || error.statusCode === 403) {
      return buildProviderErrorResponse(error.message, body.question, body.studyMode);
    }
    // DB down, invalid input, or StudyMap failure.
    console.error('[Orchestrator] Pre-pipeline failure:', error.message);
    return buildProviderErrorResponse(
      'Kuch technical dikkat aa gayi. Thodi der mein try karo.',
      body.question,
      body.studyMode
    );
  }

  // --- MAIN PIPELINE: Steps 4-7 ---
  try {
    const decision = await decideRetrieval(input, context);
    console.log('[DEBUG] intent:', decision.intent, 'needsRetrieval:', decision.needsRetrieval);
    const retrieval = await retrieveContent(decision, input, session);
    const response = await generateResponse(input, context, decision, retrieval);
    const tokenUsage = (decision.tokenUsage || 0) + (response.tokenUsage || 0);
    return saveAndRespond(input, session, context, decision, retrieval, response, userId, tokenUsage);

  } catch (error) {

    if (error instanceof ProviderUnavailableError) {
      // Calculate how many times this has happened recently
      const effectiveCount = getEffectiveErrorCount(
        session.chatState?.consecutiveErrors,
        session.chatState?.lastErrorAt
      );

      const message = getProviderErrorMessage(
        error.errorType,
        effectiveCount,
        input.question
      );

      // Save updated error count — fire and forget.
      // If this DB call fails, we still return a response to the student.
      updateChatSessionState(session.sessionId, {
        consecutiveErrors: effectiveCount + 1,
        lastErrorAt: new Date(),
      }, userId).catch((e) => console.error('[Orchestrator] consecutiveErrors save failed:', e));

      return buildProviderErrorResponse(message, input.question, input.studyMode);
    }

    // Unexpected error (e.g. Step 7 MongoDB failure) — log only, do not increment error count
    console.error('[Orchestrator] Unexpected pipeline error:', error.message);
    return buildProviderErrorResponse(
      'Kuch technical dikkat aa gayi. Thodi der mein try karo.',
      input.question,
      input.studyMode
    );
  }
};
