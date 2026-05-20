const FOLLOW_UP_SUBJECT_PATTERN =
  /\b(ye|yeh|iska|is ka|iske|isne|ye wala|ye kya|main kaam|main kam|kya karta|kya krta|function)\b/i;

const extractTopicFromSources = (sources = []) => {
  const firstSource = sources[0];

  if (!firstSource) {
    return null;
  }

  return firstSource.chapterTitle || firstSource.chapter_title || null;
};

const extractTopicFromQuestion = (question) => {
  const text = String(question || '').trim();
  const match = text.match(/^(.+?)\s+(kya hai|ka matlab|matlab kya|kya hota|kya hoti|hota hai kya|hoti hai kya|explain|define|batao|btao)\b/i);

  if (match?.[1]) {
    return match[1].trim();
  }

  return null;
};

export const resolveQuestionWithContext = ({ normalized, route, sessionContext }) => {
  if (route.rewrittenQuestion) {
    return route.rewrittenQuestion;
  }

  if (route.intent !== 'follow_up') {
    return normalized.normalizedText;
  }

  const topic = route.topicHint || sessionContext?.lastTopic || extractTopicFromSources(sessionContext?.lastSources);

  if (!topic) {
    return null;
  }

  if (FOLLOW_UP_SUBJECT_PATTERN.test(normalized.normalizedText)) {
    return `${topic} ${normalized.normalizedText}`;
  }

  return `${topic} ke baare me ${normalized.normalizedText}`;
};

export const createContextPatchFromAnswer = ({ route, question, answerPayload, scope }) => {
  const firstSource = answerPayload.sources?.[0] || {};
  const patch = {
    lastIntent: route.intent,
    lastQuestion: question,
    lastAnswer: answerPayload.answer,
    lastSources: answerPayload.sources || [],
  };
  const lastSubject = scope?.subjectId || route.subjectHint || firstSource.subject || null;
  const lastSection = scope?.sectionId || route.sectionHint || firstSource.section?.toLowerCase() || null;
  const lastChapterId = scope?.chapterId || null;

  if (lastSubject) {
    patch.lastSubject = lastSubject;
  }

  if (lastSection) {
    patch.lastSection = lastSection;
  }

  if (lastChapterId) {
    patch.lastChapterId = lastChapterId;
  }

  if (answerPayload.status === 'answered') {
    patch.lastTopic =
      route.topicHint ||
      extractTopicFromQuestion(question) ||
      firstSource.chapterTitle ||
      firstSource.chapter_title ||
      question;
  }

  return patch;
};
