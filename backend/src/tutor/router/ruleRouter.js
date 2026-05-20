import { createRoute, ROUTER_INTENTS } from './routerIntents.js';

const GREETINGS = new Set([
  'hi',
  'hii',
  'hello',
  'hey',
  'namaste',
  'namaskar',
  'salam',
  'assalamualaikum',
]);

const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const isGreeting = (text) => {
  const compact = text.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

  return GREETINGS.has(compact);
};

const hasStudyIntent = (text) =>
  hasAny(text, [
    /\b(padhna|padhunga|padhenge|padna|study|learn|start|karna|karenge)\b/i,
    /\baaj\b.*\b(padh|study|start|karenge|karunga)\b/i,
  ]);

const hasMetadataIntent = (text) =>
  hasAny(text, [
    /\bkitne\b.*\bchapter\b/i,
    /\bchapter\b.*\b(kitne|list|dikhao|kaun|available)\b/i,
    /\bkaun\s+sa\b.*\bchapter\b/i,
    /\bsyllabus\b/i,
    /\bsubject\b.*\b(kitne|list|available)\b/i,
  ]);

const hasFollowUpIntent = (text) =>
  hasAny(text, [
    /^(ye|yeh|iska|is ka|iske|isne|ye wala|ye kya)\b/i,
    /\b(main kaam|main kam|kya karta|kya krta|function kya)\b/i,
    /^(aur|or|simple|detail|thoda aur|dobara)\b/i,
  ]);

const hasRagQuestionIntent = (text) =>
  hasAny(text, [
    /\b(kya hai|ka matlab|matlab kya|define|explain|samjhao|batao|btao)\b/i,
    /\b(kaise|kyun|why|how|what|function|role|difference)\b/i,
    /\?$/
  ]);

export const routeWithRules = ({ normalized, sessionContext }) => {
  const text = normalized.normalizedText;
  const base = {
    source: 'rules',
    subjectHint: normalized.subjectHint,
    sectionHint: normalized.sectionHint,
  };

  if (isGreeting(text)) {
    return createRoute({
      ...base,
      intent: ROUTER_INTENTS.greeting,
      confidence: 0.98,
      reason: 'Short greeting detected.',
    });
  }

  if (hasMetadataIntent(text)) {
    return createRoute({
      ...base,
      intent: ROUTER_INTENTS.metadataQuestion,
      confidence: 0.94,
      reason: 'Syllabus or chapter metadata question detected.',
    });
  }

  if (hasStudyIntent(text) && (normalized.subjectHint || normalized.sectionHint)) {
    return createRoute({
      ...base,
      intent: ROUTER_INTENTS.studyIntent,
      confidence: 0.9,
      reason: 'Study intent with subject or section hint detected.',
    });
  }

  if (hasFollowUpIntent(text)) {
    return createRoute({
      ...base,
      intent: ROUTER_INTENTS.followUp,
      confidence: sessionContext?.lastTopic ? 0.88 : 0.62,
      topicHint: sessionContext?.lastTopic || null,
      reason: 'Follow-up wording detected.',
    });
  }

  if (hasRagQuestionIntent(text)) {
    return createRoute({
      ...base,
      intent: ROUTER_INTENTS.ragQuestion,
      confidence: 0.76,
      reason: 'Content-question wording detected.',
    });
  }

  return createRoute({
    ...base,
    intent: ROUTER_INTENTS.unclear,
    confidence: 0.35,
    needsClarification: true,
    reason: 'No confident rule matched.',
  });
};
