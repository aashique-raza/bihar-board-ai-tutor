export const createGreetingResponse = ({ question, studyMode, language, route, sessionContext }) => ({
  status: 'small_talk',
  intent: route.intent,
  confidence: route.confidence,
  studyMode,
  question,
  detectedLanguage: language.detectedLanguage,
  answerLanguage: language.answerLanguage,
  answer:
    'Hey, main Zuno hoon. Aaj kya padhna hai? Aap direct doubt puch sakte ho ya Focus mode me chapter choose kar sakte ho.',
  sources: [],
  suggestedActions: [
    {
      type: 'open_focus_mode',
      label: 'Choose chapter',
    },
  ],
  scope: null,
  router: route,
  session: sessionContext,
});

