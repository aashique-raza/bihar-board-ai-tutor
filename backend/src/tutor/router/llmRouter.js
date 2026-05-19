import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';

import { createChatModel } from '../../rag/query/llm/chatModel.js';
import { stringParser } from '../../rag/query/parsers/stringParser.js';
import { createRoute, ROUTER_INTENTS } from './routerIntents.js';

const ALLOWED_INTENTS = new Set(Object.values(ROUTER_INTENTS));

const routerPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You classify student chat messages for a multi-subject study tutor.

Do not answer the student. Return JSON only.

Allowed intents:
- greeting: hello/hi/namaste style message.
- study_intent: student wants to start or choose a subject/section/chapter.
- metadata_question: asks available subjects, sections, chapter count, chapter list, syllabus.
- rag_question: asks a content question that should be answered from indexed study material.
- follow_up: refers to previous topic using words like this/it/its/main work/more/simple.
- unclear: not enough information to route safely.

Return exactly:
{{
  "intent": "...",
  "confidence": 0.0,
  "subjectHint": null,
  "sectionHint": null,
  "topicHint": null,
  "rewrittenQuestion": null,
  "needsClarification": false,
  "clarificationQuestion": null,
  "reason": "short reason"
}}`,
  ],
  [
    'human',
    `Message: {message}
Normalized message: {normalizedMessage}
Known session context: {sessionContext}

Classify now.`,
  ],
]);

const parseRouterJson = (text) => {
  const jsonText = String(text || '').match(/\{[\s\S]*\}/)?.[0];

  if (!jsonText) {
    throw new Error('Router model did not return JSON.');
  }

  return JSON.parse(jsonText);
};

const sanitizeRoute = (rawRoute, fallback) => {
  const intent = ALLOWED_INTENTS.has(rawRoute.intent)
    ? rawRoute.intent
    : ROUTER_INTENTS.unclear;
  const confidence = Number(rawRoute.confidence);

  return createRoute({
    intent,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.35,
    source: 'llm',
    subjectHint: rawRoute.subjectHint || fallback.subjectHint || null,
    sectionHint: rawRoute.sectionHint || fallback.sectionHint || null,
    topicHint: rawRoute.topicHint || null,
    rewrittenQuestion: rawRoute.rewrittenQuestion || null,
    needsClarification: Boolean(rawRoute.needsClarification),
    clarificationQuestion: rawRoute.clarificationQuestion || null,
    reason: rawRoute.reason || 'LLM router classification.',
  });
};

export const routeWithLlm = async ({ normalized, sessionContext, chatModel }) => {
  const chain = RunnableSequence.from([
    routerPrompt,
    chatModel || createChatModel({ temperature: 0 }),
    stringParser,
  ]);
  const rawResponse = await chain.invoke({
    message: normalized.originalText,
    normalizedMessage: normalized.normalizedText,
    sessionContext: JSON.stringify(sessionContext || {}, null, 2),
  });

  return sanitizeRoute(parseRouterJson(rawResponse), normalized);
};

