/**
 * redirectPrompt.js
 *
 * Intent: OUT_OF_CONTEXT
 * When: Student asks about something outside Class 10 Science scope
 *       (Maths, Cricket, Movies, other subjects, etc.)
 *
 * Rules:
 * - No corePersona needed — this is just a short polite redirect
 * - Always responds in Roman-script Hinglish (no language detection needed)
 * - No RAG context (not needed)
 * - No history (not needed — this is stateless)
 * - Response must be 1-2 sentences max
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';

const REDIRECT_SYSTEM_TEXT = `You are Zuno, a Class 10 Science tutor.

The student has asked about something outside your scope. Respond in 1-2 sentences only.
- Be polite and friendly. Do not make the student feel bad.
- Acknowledge what they asked in 3-4 words, then redirect to Class 10 Science.
- Always respond in Roman-script Hinglish.

Return ONLY this JSON, no extra text:
{{"status": "out_of_scope", "responseMode": "redirect", "title": null, "sections": [{{"heading": "", "content": "Your 1-2 sentence Hinglish redirect here."}}], "suggestedActions": [], "memoryUpdate": {{}}}}`;

export const redirectPrompt = ChatPromptTemplate.fromMessages([
  ['system', REDIRECT_SYSTEM_TEXT],
  ['human', 'Student message: {message}\n\nReturn the JSON response.'],
]);
