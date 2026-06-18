/**
 * chooseCoursePrompt.js
 *
 * Intent: CHOOSE_COURSE
 * When: Student wants to start or switch to a subject or chapter.
 *       ("Physics padhna hai", "Chemistry shuru karo", "Biology chapter 2 padhao")
 *
 * Uses corePersona: YES
 * History window:   last 4 messages (trimmed in step6 handler)
 * RAG context:      NO  — chapter content not needed here, just the chapter list
 * Curriculum:       YES — needed to show available chapters
 * Language:         YES — follows {answerLanguageInstruction}
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { corePersonaText } from './corePersona.js';

// ─── Course selection specific rules ─────────────────────────────────────────

const CHOOSE_COURSE_SPECIFIC_TEXT = `The student wants to start studying a subject or chapter.
Your job: show them what is available and invite them to begin.

RULES:
- List ONLY the chapters that appear in the curriculum index below. Do not invent any.
- End with an invitation — ask if they want to start from Chapter 1 or jump to a specific topic.
- Keep it encouraging and brief. Do not explain the chapters — just list them.
- Always respond in the language specified in the answer language instruction.

Example response style:
"Chemistry mein padhte hain! Hamare paas yeh chapters hain: [list]. Kahan se shuru karein?"

JSON OUTPUT (return this exact structure, no extra text):
{{"status": "answered", "responseMode": "study_tutor", "title": "Chapter Selection", "sections": [{{"heading": "", "content": "Your chapter list + invitation here."}}], "suggestedActions": [], "memoryUpdate": {{"learningMode": "lesson"}}}}`;

// ─── Compose full system text ─────────────────────────────────────────────────

const CHOOSE_COURSE_SYSTEM_TEXT = `${corePersonaText}

${CHOOSE_COURSE_SPECIFIC_TEXT}`;

// ─── Prompt template ──────────────────────────────────────────────────────────

export const chooseCoursePrompt = ChatPromptTemplate.fromMessages([
  ['system', CHOOSE_COURSE_SYSTEM_TEXT],
  [
    'human',
    `Student message: {message}

Answer language instruction: {answerLanguageInstruction}

Available chapters (Full Curriculum Index):
{curriculumSummary}

Recent conversation (last 4 messages):
{history}

Return the JSON response.`,
  ],
]);
