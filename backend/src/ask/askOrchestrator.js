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
import { probeAcademicSimilarity } from './intentSafetyNet.js';
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
import { env } from '../config/env.js';

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

    // --- Layer 2.2: Academic Safety Net ---
    // The 8B decider occasionally misclassifies academic queries as GREETING or
    // OUT_OF_CONTEXT. This probe catches those cases by checking vector similarity.
    // Fires ONLY for these two intents — EXPLAIN_MORE/NEXT_STEP have their own RAG
    // paths in step5, and UNSAFE must never be promoted to academic.
    // Override runs BEFORE Phase 3 cap check (future) so academic queries always go through.
    const SAFETY_NET_TARGETS = new Set(['GREETING', 'OUT_OF_CONTEXT']);
    if (SAFETY_NET_TARGETS.has(decision.intent)) {
      const { score, fired } = await probeAcademicSimilarity(input.question);
      if (fired) {
        console.warn(
          `[SafetyNet] ${decision.intent} → CONCEPT_QUESTION | score:${score.toFixed(3)} | query:"${input.question.slice(0, 60)}"`
        );
        decision.intent         = 'CONCEPT_QUESTION';
        decision.inScope        = true;
        decision.needsRetrieval = true;
        decision.responseMode   = 'study_tutor';
        decision.searchQuery    = input.question;
        decision._overridden    = true;
      }
    }

    // --- Phase 3: Session Drift Cap (Step 3.2.2) ---
    // Fires AFTER safety net so academic queries are never blocked.
    // Skips step5/step6 (zero LLM tokens) but routes through step7 for full persistence:
    // history saved, messageCount incremented, totalTokensUsed tracked, session payload returned.
    // Uses 'DRIFT_CAP' intent — not in ACADEMIC_INTENTS or DRIFT_INTENTS — so drift counters
    // are intentionally left unchanged (totalNonAcademicTurns stays at cap, not incremented).
    const DRIFT_CAP_INTENTS = new Set(['GREETING', 'OUT_OF_CONTEXT']);
    if (
      DRIFT_CAP_INTENTS.has(decision.intent) &&
      (context.driftSignal?.totalNonAcademic ?? 0) >= env.maxNonAcademicTurns
    ) {
      console.warn(
        `[DriftCap] Session ${session.sessionId} — total drift ${context.driftSignal.totalNonAcademic} >= max ${env.maxNonAcademicTurns}. Blocking ${decision.intent} turn.`
      );
      const capContent = 'Zuno sirf Science padhaane ke liye hai! Koi bhi topic chunao — Physics, Chemistry, ya Biology — aur hum shuru karte hain.';

      const capDecision  = { ...decision, intent: 'DRIFT_CAP' };
      const capRetrieval = { retrieval: null, chunks: [], sources: [], retrievedContext: 'NO_RETRIEVED_CONTEXT', nextTopicSignal: null, lastRetrievalQuery: null };
      const capResponse  = { status: 'answered', responseMode: 'conversation', title: null, sections: [{ heading: '', content: capContent }], answer: capContent, suggestedActions: [], memoryUpdate: {}, tokenUsage: 0, tokenBreakdown: { input: 0, output: 0, total: 0, cached: 0 } };

      try {
        return await saveAndRespond(input, session, context, capDecision, capRetrieval, capResponse, userId, decision.tokenUsage || 0);
      } catch {
        // DB failed — student still gets the cap message, session data stays stale
        return {
          status: 'answered', intent: 'conversation', responseMode: 'conversation',
          studyMode: input.studyMode, question: input.question,
          detectedLanguage: context.language?.detectedLanguage ?? 'hinglish',
          answerLanguage:   context.language?.answerLanguage   ?? 'hinglish',
          title: null, sections: [{ heading: '', content: capContent }],
          answer: capContent, sources: [], suggestedActions: [],
          retrieval: null, decision: null, session: null,
        };
      }
    }

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
