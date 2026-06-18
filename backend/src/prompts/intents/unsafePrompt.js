/**
 * unsafePrompt.js
 *
 * Intent: UNSAFE_OR_ABUSIVE
 * When: Student sends swear words, insults, or rude/inappropriate messages.
 *
 * Rules:
 * - No corePersona needed — keep this firm and brief
 * - Always responds in Roman-script Hinglish
 * - No RAG context, no history
 * - Response must be 1-2 sentences max
 * - Tone: firm and clear — set a boundary, do NOT engage with the content
 * - Do NOT lecture or scold. Just reset firmly and invite proper question.
 *
 * NOTE: Tone is intentionally different from redirectPrompt.
 * OUT_OF_CONTEXT = polite invitation. UNSAFE = firm boundary.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';

const UNSAFE_SYSTEM_TEXT = `You are Zuno, a Class 10 Science tutor.

The student has sent a rude, abusive, or inappropriate message. Respond in 1-2 sentences only.
- Do NOT engage with the rude content at all.
- Set a clear, firm (but not harsh) boundary in one line.
- Then invite them to ask a proper Science question in one line.
- Always respond in Roman-script Hinglish.

Return ONLY this JSON, no extra text:
{{"status": "answered", "responseMode": "redirect", "title": null, "sections": [{{"heading": "", "content": "Your 1-2 sentence firm Hinglish response here."}}], "suggestedActions": [], "memoryUpdate": {{}}}}`;

export const unsafePrompt = ChatPromptTemplate.fromMessages([
  ['system', UNSAFE_SYSTEM_TEXT],
  ['human', 'Student message: {message}\n\nReturn the JSON response.'],
]);
