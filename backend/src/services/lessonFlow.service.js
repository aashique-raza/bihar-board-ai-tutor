import { loadCurriculumIndex } from '../tutor/curriculum/curriculumIndexStore.js';
import { findChapterById, resolveChapter } from '../tutor/curriculum/chapterResolver.js';
import { getChapterCoreTopics } from '../tutor/curriculum/topicResolver.js';
import { generateLessonFromTopic } from './lessonGeneration.service.js';

const START_WORDS = ['padhao', 'padhna', 'start', 'shuru', 'suruaat'];
const NEXT_WORDS = ['next', 'aage', 'continue', 'chalu rakho', 'start kro', 'start karo'];

const hasAnyWord = (text, words) =>
  words.some((word) => text.includes(word));

const cleanTopicTitle = (title) =>
  String(title || '')
    .replace(/^\d+\.\s*/, '')
    .trim();

const findTopicIndex = (topics, topicId) =>
  topics.findIndex((topic) => topic.topicId === topicId);

const resolveChapterForLesson = (curriculumIndex, normalizedText, chatState) => {
  const chapterMatch = resolveChapter(curriculumIndex, normalizedText);

  if (chapterMatch.status === 'resolved') {
    return chapterMatch;
  }

  if (chapterMatch.status !== 'ambiguous' || !chatState.currentSectionId) {
    return chapterMatch;
  }

  const matchedChapter = chapterMatch.matches.find(
    (match) => match.chapter.sectionId === chatState.currentSectionId
  )?.chapter;

  if (!matchedChapter) {
    return chapterMatch;
  }

  return {
    status: 'resolved',
    chapter: matchedChapter,
    matches: chapterMatch.matches,
    reason: 'Ambiguous chapter resolved from saved chat state section.',
  };
};

const createLessonPayload = ({
  action,
  question,
  studyMode,
  chapter,
  topic,
  topicNumber,
  totalTopics,
  isLastTopic,
  lessonAnswer,
}) => {
  const topicTitle = cleanTopicTitle(topic.title);
  const status = action === 'start_lesson' ? 'lesson_started' : 'lesson_continued';

  return {
    status,
    intent: action,
    confidence: 0.95,
    studyMode,
    question,
    answer: lessonAnswer.answer,
    sources: lessonAnswer.sources,
    suggestedActions: isLastTopic
      ? []
      : [
          {
            type: 'continue_lesson',
            label: 'Next topic',
          },
        ],
    lesson: {
      chapterId: chapter.chapterId,
      chapterTitle: chapter.title,
      topicId: topic.topicId,
      topicTitle,
      topicNumber,
      totalTopics,
      nextAction: isLastTopic ? null : 'continue_lesson',
      generationMode: lessonAnswer.generationMode,
    },
    scope: {
      subjectId: chapter.subjectId,
      subjectTitle: chapter.subjectTitle,
      sectionId: chapter.sectionId,
      sectionTitle: chapter.sectionTitle,
      chapterId: chapter.chapterId,
      chapterTitle: chapter.title,
    },
    router: {
      intent: action,
      source: 'lesson_flow',
      confidence: 0.95,
      reason: 'Deterministic lesson flow handled this message.',
    },
  };
};

const createGroundedLessonPayload = async ({
  action,
  question,
  studyMode,
  chapter,
  topic,
  topicNumber,
  totalTopics,
  isLastTopic,
}) => {
  const lessonAnswer = await generateLessonFromTopic({
    chapter,
    topic,
  });

  return createLessonPayload({
    action,
    question,
    studyMode,
    chapter,
    topic,
    topicNumber,
    totalTopics,
    isLastTopic,
    lessonAnswer,
  });
};

const createLessonFinishedPayload = ({ question, studyMode, chapter }) => ({
  status: 'lesson_completed',
  intent: 'continue_lesson',
  confidence: 0.95,
  studyMode,
  question,
  answer: `${chapter.title} ke core topics complete ho gaye. Ab aap doubt puch sakte ho ya revision bol sakte ho.`,
  sources: [],
  suggestedActions: [],
  lesson: {
    chapterId: chapter.chapterId,
    chapterTitle: chapter.title,
    topicId: null,
    topicTitle: null,
    nextAction: null,
  },
  scope: {
    subjectId: chapter.subjectId,
    subjectTitle: chapter.subjectTitle,
    sectionId: chapter.sectionId,
    sectionTitle: chapter.sectionTitle,
    chapterId: chapter.chapterId,
    chapterTitle: chapter.title,
  },
  router: {
    intent: 'continue_lesson',
    source: 'lesson_flow',
    confidence: 0.95,
    reason: 'All core lesson topics are complete.',
  },
});

export const getLessonResponse = async ({
  question,
  normalizedText,
  studyMode,
  chatState,
  forceStart = false,
}) => {
  const curriculumIndex = await loadCurriculumIndex();
  const chapterMatch = resolveChapterForLesson(curriculumIndex, normalizedText, chatState);
  const wantsStart = hasAnyWord(normalizedText, START_WORDS);
  const wantsNext = hasAnyWord(normalizedText, NEXT_WORDS);
  const hasCurrentChapter = Boolean(chatState.currentChapterId);

  if (chapterMatch.status === 'resolved' && (wantsStart || forceStart)) {
    const chapter = chapterMatch.chapter;
    const topics = getChapterCoreTopics(curriculumIndex, chapter.chapterId);
    const topic = topics[0];

    if (!topic) {
      return null;
    }

    return {
      response: await createGroundedLessonPayload({
        action: 'start_lesson',
        question,
        studyMode,
        chapter,
        topic,
        topicNumber: 1,
        totalTopics: topics.length,
        isLastTopic: topics.length === 1,
      }),
      stateUpdates: {
        currentSubjectId: chapter.subjectId,
        currentSectionId: chapter.sectionId,
        currentChapterId: chapter.chapterId,
        currentTopicId: topic.topicId,
        learningMode: 'lesson',
        pendingAction: topics.length === 1 ? null : 'continue_lesson',
        completedTopicIds: [topic.topicId],
        lastTopic: cleanTopicTitle(topic.title),
        lastDoubtTopic: null,
        lastDoubtQuestion: null,
        lastDoubtSources: [],
      },
    };
  }

  if (hasCurrentChapter && wantsNext) {
    const chapter = chapterMatch.status === 'resolved'
      ? chapterMatch.chapter
      : findChapterById(curriculumIndex, chatState.currentChapterId);
    const chapterId = chapter?.chapterId || chatState.currentChapterId;
    const topics = getChapterCoreTopics(curriculumIndex, chapterId);
    const currentIndex = findTopicIndex(topics, chatState.currentTopicId);
    const nextTopic = topics[currentIndex + 1] || topics[0];
    const nextIndex = findTopicIndex(topics, nextTopic?.topicId);
    const publicChapter = chapter || {
      chapterId,
      title: chatState.currentChapterTitle || 'Selected chapter',
      number: '',
      subjectId: chatState.currentSubjectId,
      subjectTitle: 'Science',
      sectionId: chatState.currentSectionId,
      sectionTitle: chatState.currentSectionId || 'Science',
    };

    if (!nextTopic) {
      return null;
    }

    if (currentIndex >= topics.length - 1 && currentIndex !== -1) {
      return {
        response: createLessonFinishedPayload({
          question,
          studyMode,
          chapter: publicChapter,
        }),
        stateUpdates: {
          learningMode: 'idle',
          pendingAction: null,
        },
      };
    }

    return {
      response: await createGroundedLessonPayload({
        action: 'continue_lesson',
        question,
        studyMode,
        chapter: publicChapter,
        topic: nextTopic,
        topicNumber: nextIndex + 1,
        totalTopics: topics.length,
        isLastTopic: nextIndex === topics.length - 1,
      }),
      stateUpdates: {
        currentSubjectId: publicChapter.subjectId,
        currentSectionId: publicChapter.sectionId,
        currentChapterId: publicChapter.chapterId,
        currentTopicId: nextTopic.topicId,
        learningMode: 'lesson',
        pendingAction: nextIndex === topics.length - 1 ? null : 'continue_lesson',
        completedTopicIds: [...new Set([...(chatState.completedTopicIds || []), nextTopic.topicId])],
        lastTopic: cleanTopicTitle(nextTopic.title),
      },
    };
  }

  return null;
};
