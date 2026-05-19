export const ROUTER_INTENTS = {
  greeting: 'greeting',
  studyIntent: 'study_intent',
  metadataQuestion: 'metadata_question',
  ragQuestion: 'rag_question',
  followUp: 'follow_up',
  unclear: 'unclear',
};

export const ROUTER_CONFIDENCE = {
  high: 0.8,
  medium: 0.55,
};

export const createRoute = ({
  intent,
  confidence,
  source,
  subjectHint = null,
  sectionHint = null,
  topicHint = null,
  rewrittenQuestion = null,
  needsClarification = false,
  clarificationQuestion = null,
  reason = '',
}) => ({
  intent,
  confidence,
  source,
  subjectHint,
  sectionHint,
  topicHint,
  rewrittenQuestion,
  needsClarification,
  clarificationQuestion,
  reason,
});

