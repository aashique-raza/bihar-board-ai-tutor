import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';

import { createChatModel } from '../../rag/query/llm/chatModel.js';
import { stringParser } from '../../rag/query/parsers/stringParser.js';
import { parseJsonObject } from './json.js';

const deciderPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are the routing brain for Zuno, a Bihar Board Class 10 Science tutor.

Your job is intentionally small:
- Decide whether the student's latest message is in scope for Class 10 Science tutoring or warm tutor conversation.
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
- "study_tutor": science learning, explanation, lesson, doubt, chapter/topic navigation, study help.
- "redirect": out-of-scope or unsafe request.

Retrieval rules:
- Use needsRetrieval=true for science facts, doubts, explanations, lessons, "next" lesson content, examples of science concepts, or when the answer must be grounded in study content.
- Use needsRetrieval=false for greeting, identity, motivation, thanks, or curriculum navigation such as chapter counts/lists when the curriculum summary is enough.
- If the student refers to "this", "next", "again", "same topic", or "iska", use memory and recent history to make the searchQuery complete.
- If the request is out of Class 10 Science tutoring, set inScope=false, responseMode="redirect", needsRetrieval=false.`,
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

let deciderChain = null;

const getDeciderChain = () => {
  if (!deciderChain) {
    deciderChain = RunnableSequence.from([
      deciderPrompt,
      createChatModel(),
      stringParser,
    ]);
  }

  return deciderChain;
};

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

export const decideRetrieval = async ({
  message,
  memory,
  history,
  curriculumSummary,
  focusChapter,
}) => {
  const rawDecision = await getDeciderChain().invoke({
    message,
    memory,
    history,
    curriculumSummary,
    focusChapter,
  });
  const decision = parseJsonObject(rawDecision, 'Retrieval decision');

  return normalizeDecision(decision, message);
};
