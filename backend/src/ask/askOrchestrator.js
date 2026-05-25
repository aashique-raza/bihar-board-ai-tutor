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

/**
 * Main Ask API handler.
 * Called by ask.controller.js → ask.routes.js → POST /api/v1/ask
 *
 * @param {object} body - Raw request body { question, studyMode, sessionId, chapterId }
 * @returns {object}    - The complete API response payload
 */
export const askQuestion = async (body = {}) => {
  // Step 1: Validate the student's input (question, studyMode, chapterId)
  const input = await validateInput(body);

  // Step 2: Load or create the chat session, state, and history from MongoDB
  const session = await loadSession(input);

  // Step 3: Detect language, format memory/history/curriculum for the LLM prompts
  const context = await buildContext(input, session);

  // Step 4: Ask the Decider LLM — is this in scope? Does it need RAG? (1st LLM call)
  const decision = await decideRetrieval(input, context);

  // Step 5: Search the vector store if the Decider said needsRetrieval=true
  const retrieval = await retrieveContent(decision, input);

  // Step 6: Generate the tutor's answer using the main Tutor LLM (2nd LLM call)
  const response = await generateResponse(input, context, decision, retrieval);

  // Step 7: Save everything to MongoDB and return the final API response
  return saveAndRespond(input, session, context, decision, retrieval, response);
};
