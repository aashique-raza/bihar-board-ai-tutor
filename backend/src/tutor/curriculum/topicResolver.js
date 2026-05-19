import { resolveChapter, findChapterById } from './chapterResolver.js';

const normalizeSearchText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) =>
  normalizeSearchText(value)
    .split(' ')
    .filter((token) => token.length > 2);

const countTokenOverlap = (leftTokens, rightTokens) => {
  const rightSet = new Set(rightTokens);

  return leftTokens.filter((token) => rightSet.has(token)).length;
};

const flattenTopics = (curriculumIndex, chapterId = null) => {
  const topics = [];

  for (const subject of curriculumIndex.subjects || []) {
    for (const section of subject.sections || []) {
      for (const chapter of section.chapters || []) {
        if (chapterId && chapter.chapterId !== chapterId) {
          continue;
        }

        for (const topic of chapter.topics || []) {
          topics.push({
            ...topic,
            chapterId: chapter.chapterId,
            chapterNumber: chapter.number,
            chapterTitle: chapter.title,
            subjectId: subject.subjectId,
            subjectTitle: subject.title,
            sectionId: section.sectionId,
            sectionTitle: section.title,
          });
        }
      }
    }
  }

  return topics;
};

const getSearchableTopicText = (topic) =>
  [
    topic.title,
    topic.headingPath,
    ...(topic.ragHints || []),
  ].join(' ');

const createTopicMatch = ({ topic, normalizedText, chapterScoped }) => {
  const titleText = normalizeSearchText(topic.title);
  const headingPathText = normalizeSearchText(topic.headingPath);
  const messageTokens = tokenize(normalizedText);
  const topicTokens = tokenize(getSearchableTopicText(topic));
  const titleTokens = tokenize(topic.title);
  let score = 0;
  const reasons = [];

  if (titleText && normalizedText.includes(titleText)) {
    score += 100;
    reasons.push('topic_title');
  }

  if (headingPathText && normalizedText.includes(headingPathText)) {
    score += 60;
    reasons.push('heading_path');
  }

  const titleOverlap = countTokenOverlap(messageTokens, titleTokens);
  if (titleOverlap > 0) {
    score += titleOverlap * 25;
    reasons.push('topic_title_tokens');
  }

  const topicOverlap = countTokenOverlap(messageTokens, topicTokens);
  if (topicOverlap > titleOverlap) {
    score += (topicOverlap - titleOverlap) * 8;
    reasons.push('topic_hint_tokens');
  }

  if (chapterScoped) {
    score += 15;
    reasons.push('chapter_scope');
  }

  if (topic.role === 'core') {
    score += 5;
  } else if (topic.role === 'subtopic') {
    score += 4;
  } else if (topic.role === 'overview') {
    score += 2;
  } else if (topic.role === 'practice') {
    score -= 10;
  }

  return {
    topic,
    score,
    reasons,
  };
};

const toPublicTopic = (topic) => ({
  topicId: topic.topicId,
  title: topic.title,
  order: topic.order,
  role: topic.role,
  headingPath: topic.headingPath,
  chapterId: topic.chapterId,
  chapterNumber: topic.chapterNumber,
  chapterTitle: topic.chapterTitle,
  subjectId: topic.subjectId,
  subjectTitle: topic.subjectTitle,
  sectionId: topic.sectionId,
  sectionTitle: topic.sectionTitle,
  sourcePath: topic.sourcePath,
  ragHints: topic.ragHints || [],
});

const buildResult = ({ status, match = null, matches = [], chapter = null, reason }) => ({
  status,
  topic: match ? toPublicTopic(match.topic) : null,
  chapter,
  matches: matches.map((item) => ({
    topic: toPublicTopic(item.topic),
    score: item.score,
    reasons: item.reasons,
  })),
  reason,
});

export const resolveTopic = (curriculumIndex, message, options = {}) => {
  const normalizedText = normalizeSearchText(message);
  const explicitChapterId = options.chapterId || null;
  const chapterMatch = explicitChapterId
    ? { status: 'resolved', chapter: findChapterById(curriculumIndex, explicitChapterId) }
    : resolveChapter(curriculumIndex, message);
  const chapterId = chapterMatch.status === 'resolved' && chapterMatch.chapter
    ? chapterMatch.chapter.chapterId
    : null;
  const chapterScoped = Boolean(chapterId);
  const topics = flattenTopics(curriculumIndex, chapterId);

  if (!normalizedText) {
    return buildResult({
      status: 'not_found',
      chapter: chapterMatch.chapter || null,
      reason: 'Empty message.',
    });
  }

  const matches = topics
    .map((topic) => createTopicMatch({ topic, normalizedText, chapterScoped }))
    .filter((match) => match.score >= 30)
    .sort((left, right) => right.score - left.score || left.topic.order - right.topic.order);

  if (matches.length === 0) {
    return buildResult({
      status: 'not_found',
      chapter: chapterMatch.chapter || null,
      reason: 'No topic matched the message.',
    });
  }

  const bestScore = matches[0].score;
  const topMatches = matches.filter((match) => match.score === bestScore);

  if (topMatches.length > 1) {
    return buildResult({
      status: 'ambiguous',
      matches: topMatches,
      chapter: chapterMatch.chapter || null,
      reason: 'Multiple topics matched equally well.',
    });
  }

  return buildResult({
    status: 'resolved',
    match: matches[0],
    matches: matches.slice(0, 5),
    chapter: chapterMatch.chapter || null,
    reason: 'Best topic match selected.',
  });
};

export const getChapterCoreTopics = (curriculumIndex, chapterId) =>
  flattenTopics(curriculumIndex, chapterId)
    .filter((topic) => topic.role === 'core')
    .sort((left, right) => left.order - right.order)
    .map(toPublicTopic);
