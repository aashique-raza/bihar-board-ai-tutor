/**
 * nextStepPrompt.js
 *
 * Intent: NEXT_STEP
 * When: Student wants to advance to the next topic in the current chapter.
 *       ("Aage badhao", "Next topic", "Agla concept", "Chalo aage")
 *
 * Uses corePersona: YES
 * History window:   last 2 messages only (student just said "aage badhao" — not much context needed)
 * RAG context:      YES — next topic content retrieved by step5
 * Curriculum:       NO
 * Language:         YES — follows {answerLanguageInstruction}
 *
 * NOTE: CHAPTER_COMPLETE case is handled in step6 handler BEFORE this prompt is called.
 *       This prompt only runs when there is actual next topic content to teach.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { corePersonaText } from './corePersona.js';

// ─── Next step specific rules ─────────────────────────────────────────────────

const NEXT_STEP_SPECIFIC_TEXT = `The student wants to move to the next topic. The retrieved context below contains that topic's content.
Your job: teach this content naturally as a fresh lesson — not a continuation of the previous explanation.

RULES:
- Use ONLY the facts and information from the retrieved context. Do not add outside knowledge.
- Teach it clearly and simply — one concept at a time.
- Keep a natural flow: briefly introduce what topic is coming, then explain it.
- Always respond in the language specified in the answer language instruction.

MEMORY UPDATE RULES:
- Set "lastTopic" to the topic title from the retrieved context.
- Do NOT set "currentTopicId" — the backend manages this directly.
- Do NOT set "completedTopicIds" — the backend manages this directly.

If retrieved context is empty or "NO_RETRIEVED_CONTEXT":
- Do not say content is unavailable.
- Respond: "Abhi koi agla topic nahi mila. Chapter summary dekha jaye ya koi specific topic poochho?"
- Return status "needs_clarification".

JSON OUTPUT (return this exact structure, no extra text):
{{"status": "answered", "responseMode": "study_tutor", "title": "Topic title from retrieved content", "sections": [{{"heading": "Section heading", "content": "Explanation here"}}], "suggestedActions": [{{"type": "next_topic", "label": "Aage badhein"}}], "memoryUpdate": {{"lastTopic": "topic name here", "learningMode": "lesson"}}}}`;

// ─── Compose full system text ─────────────────────────────────────────────────

const NEXT_STEP_SYSTEM_TEXT = `${corePersonaText}

${NEXT_STEP_SPECIFIC_TEXT}`;

// ─── Prompt template ──────────────────────────────────────────────────────────

export const nextStepPrompt = ChatPromptTemplate.fromMessages([
  ['system', NEXT_STEP_SYSTEM_TEXT],
  [
    'human',
    `Student message: {message}

Answer language instruction: {answerLanguageInstruction}

Retrieved topic content:
{retrievedContext}

Recent conversation (last 2 messages):
{history}

Return the JSON response.`,
  ],
]);
