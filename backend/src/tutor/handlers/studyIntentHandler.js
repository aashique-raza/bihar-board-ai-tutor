const titleCase = (value) =>
  String(value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const createStudyIntentResponse = ({
  question,
  studyMode,
  language,
  route,
  sessionContext,
}) => {
  const sectionLabel = titleCase(route.sectionHint);
  const subjectLabel = titleCase(route.subjectHint || 'subject');
  const target = sectionLabel || subjectLabel;

  return {
    status: 'study_intent_detected',
    intent: route.intent,
    confidence: route.confidence,
    studyMode,
    question,
    detectedLanguage: language.detectedLanguage,
    answerLanguage: language.answerLanguage,
    answer: `${target} padhte hain. Focus mode me ek chapter choose karo, phir Zuno sirf selected chapter ke context se answer dega.`,
    sources: [],
    suggestedActions: [
      {
        type: 'open_focus_mode',
        label: 'Open Focus Mode',
      },
      {
        type: 'show_chapters',
        label: 'Show chapters',
        subjectHint: route.subjectHint,
        sectionHint: route.sectionHint,
      },
    ],
    scope: null,
    router: route,
    session: sessionContext,
  };
};

