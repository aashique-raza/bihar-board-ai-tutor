import { getStudyMap } from '../../services/studyMap.service.js';

const normalize = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const formatChapterList = (chapters) =>
  chapters.map((chapter) => `${chapter.number}. ${chapter.title}`).join('\n');

const findSection = (studyMap, sectionHint) => {
  if (!sectionHint) {
    return null;
  }

  for (const subject of studyMap.focusStudy.subjects || []) {
    const section = (subject.sections || []).find(
      (item) => normalize(item.title) === normalize(sectionHint)
    );

    if (section) {
      return { subject, section };
    }
  }

  return null;
};

const findSubject = (studyMap, subjectHint) => {
  if (!subjectHint) {
    return null;
  }

  return (studyMap.focusStudy.subjects || []).find(
    (subject) => normalize(subject.title) === normalize(subjectHint)
  );
};

export const createMetadataResponse = async ({
  question,
  studyMode,
  language,
  route,
  sessionContext,
}) => {
  const studyMap = await getStudyMap();
  const sectionHint = route.sectionHint || sessionContext?.lastSection;
  const subjectHint = route.subjectHint || sessionContext?.lastSubject;
  const matchedSection = findSection(studyMap, sectionHint);

  if (matchedSection) {
    const { subject, section } = matchedSection;

    return {
      status: 'metadata_answered',
      intent: route.intent,
      confidence: route.confidence,
      studyMode,
      question,
      detectedLanguage: language.detectedLanguage,
      answerLanguage: language.answerLanguage,
      answer: `${section.title} me ${section.chapters.length} chapters available hain:\n${formatChapterList(section.chapters)}`,
      sources: [],
      suggestedActions: [
        {
          type: 'show_chapters',
          label: 'Show chapters',
          subjectId: subject.id,
          sectionId: section.id,
        },
      ],
      scope: {
        subjectId: subject.id,
        subjectTitle: subject.title,
        sectionId: section.id,
        sectionTitle: section.title,
      },
      router: route,
      session: sessionContext,
    };
  }

  const matchedSubject = findSubject(studyMap, subjectHint);

  if (matchedSubject) {
    const chapterCount = matchedSubject.sections.reduce(
      (total, section) => total + section.chapters.length,
      0
    );

    return {
      status: 'metadata_answered',
      intent: route.intent,
      confidence: route.confidence,
      studyMode,
      question,
      detectedLanguage: language.detectedLanguage,
      answerLanguage: language.answerLanguage,
      answer: `${matchedSubject.title} me ${chapterCount} chapters available hain.`,
      sources: [],
      suggestedActions: [
        {
          type: 'show_subject',
          label: 'Show subject',
          subjectId: matchedSubject.id,
        },
      ],
      scope: {
        subjectId: matchedSubject.id,
        subjectTitle: matchedSubject.title,
      },
      router: route,
      session: sessionContext,
    };
  }

  return {
    status: 'needs_clarification',
    intent: route.intent,
    confidence: route.confidence,
    studyMode,
    question,
    detectedLanguage: language.detectedLanguage,
    answerLanguage: language.answerLanguage,
    answer:
      'Aap kis subject ya section ke chapters ke baare me puch rahe ho? Jaise Physics, Chemistry, Biology, Math, Hindi.',
    sources: [],
    suggestedActions: [],
    scope: null,
    router: route,
    session: sessionContext,
  };
};
