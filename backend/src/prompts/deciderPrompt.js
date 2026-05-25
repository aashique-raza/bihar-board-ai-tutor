/**
 * deciderPrompt.js
 *
 * The LLM prompt for the Retrieval Decider (Step 4 of the Ask API flow).
 *
 * PURPOSE:
 *   This is the FIRST LLM call in the Ask API. It does NOT write the student's answer.
 *   It only makes 3 small decisions:
 *     1. Is this question in scope for Class 10 Science tutoring?
 *     2. Does answering it require retrieving content from the vector store?
 *     3. If retrieval is needed, what search query should be used?
 *
 * INPUT VARIABLES:
 *   {message}          - The student's latest message
 *   {memory}           - Compact summary of current tutor state (from MongoDB)
 *   {history}          - Recent conversation messages (last 8 turns)
 *   {curriculumSummary} - List of available chapters (Physics, Chemistry, Biology)
 *   {focusChapter}     - The chapter selected in Focus Mode, or "No focus chapter selected."
 *
 * OUTPUT (JSON):
 *   {
 *     "inScope": true/false,
 *     "needsRetrieval": true/false,
 *     "responseMode": "conversation" | "study_tutor" | "redirect",
 *     "searchQuery": "string or null",
 *     "reason": "short reason"
 *   }
 *
 * RESPONSE MODES:
 *   - conversation  → greeting, identity, motivation, thanks, light chat
 *   - study_tutor   → Science learning, explanation, lesson, doubt, chapter navigation
 *   - redirect      → out-of-scope or unsafe request
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';

export const deciderPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are the routing brain for Zuno, a Bihar Board Class 10 tutor.

Your job is intentionally small:
- Decide whether the student's latest message is in scope for Class 10 tutoring or warm tutor conversation.
- Decide whether study-content retrieval is needed.
- If retrieval is needed, write one clean search query.

Do not write the final student answer.
Do not create many intent categories.
Do not invent chapters, topics, or facts.

Return JSON only with this shape:
{{
  "inScope": true,
  "needsRetrieval": false,
  "responseMode": "conversation",
  "searchQuery": null,
  "reason": "short reason"
}}

Allowed responseMode values:
- "conversation": greetings, identity, motivation, thanks, natural tutor chat.
- "study_tutor": student learning, explanation, lesson, doubt, chapter/topic navigation, study help.
- "redirect": out-of-scope or unsafe request.

Retrieval rules:
- Use needsRetrieval=true for study facts, doubts, explanations, lessons, "next" lesson content, examples of concepts, or when the answer must be grounded in study content.
- Use needsRetrieval=false for greeting, identity, motivation, thanks, or curriculum navigation such as chapter counts/lists when the curriculum summary is enough.
- If the student refers to "this", "next", "again", "same topic", or "iska", use memory and recent history to make the searchQuery complete.
- If the request is out of Class 10 tutoring, set inScope=false, responseMode="redirect", needsRetrieval=false.`,
  ],
  [
    'human',
    `Latest student message:
{message}

Compact tutor memory:
{memory}

Recent conversation:
{history}

Available curriculum summary:
{curriculumSummary}

Focus chapter, if selected:
{focusChapter}

Return JSON only.`,
  ],
]);
