export const createClarificationResponse = ({
  question,
  studyMode,
  language,
  route,
  sessionContext,
}) => ({
  status: 'needs_clarification',
  intent: route.intent,
  confidence: route.confidence,
  studyMode,
  question,
  detectedLanguage: language.detectedLanguage,
  answerLanguage: language.answerLanguage,
  answer:
    route.clarificationQuestion ||
    'Mujhe clear nahi hua. Aap topic ka naam ya chapter thoda clearly likh do.',
  sources: [],
  suggestedActions: [],
  scope: null,
  router: route,
  session: sessionContext,
});

