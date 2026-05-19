import { normalizeMessage } from '../normalization/normalizeMessage.js';

const NUMBER_WORDS = new Map([
  ['one', 1],
  ['first', 1],
  ['ek', 1],
  ['pehla', 1],
  ['pahla', 1],
  ['do', 2],
  ['two', 2],
  ['second', 2],
  ['dusra', 2],
  ['teen', 3],
  ['three', 3],
  ['third', 3],
  ['teesra', 3],
  ['char', 4],
  ['four', 4],
  ['fourth', 4],
  ['panch', 5],
  ['five', 5],
  ['fifth', 5],
  ['chhe', 6],
  ['six', 6],
  ['sixth', 6],
  ['saat', 7],
  ['seven', 7],
  ['seventh', 7],
]);

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

const unique = (values) => [...new Set(values.filter((value) => value !== null))];

const extractChapterNumbers = (text) => {
  const normalized = normalizeSearchText(text);
  const numbers = [];
  const explicitPatterns = [
    /\bchapter\s+(\d{1,2})\b/g,
    /\bchapter\s+number\s+(\d{1,2})\b/g,
    /\bch\s+(\d{1,2})\b/g,
  ];

  for (const pattern of explicitPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      numbers.push(Number.parseInt(match[1], 10));
    }
  }

  for (const [word, number] of NUMBER_WORDS.entries()) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) {
      numbers.push(number);
    }
  }

  return unique(numbers);
};

const flattenChapters = (curriculumIndex) => {
  const chapters = [];

  for (const subject of curriculumIndex.subjects || []) {
    for (const section of subject.sections || []) {
      for (const chapter of section.chapters || []) {
        chapters.push({
          ...chapter,
          subjectId: subject.subjectId,
          subjectTitle: subject.title,
          sectionId: section.sectionId,
          sectionTitle: section.title,
        });
      }
    }
  }

  return chapters;
};

const countTokenOverlap = (leftTokens, rightTokens) => {
  const rightSet = new Set(rightTokens);

  return leftTokens.filter((token) => rightSet.has(token)).length;
};

const createChapterMatch = ({ chapter, normalizedText, sectionHint, subjectHint, chapterNumbers }) => {
  const titleText = normalizeSearchText(chapter.title);
  const messageTokens = tokenize(normalizedText);
  const titleTokens = tokenize(chapter.title);
  const overlap = countTokenOverlap(messageTokens, titleTokens);
  let score = 0;
  const reasons = [];

  if (chapterNumbers.includes(chapter.number)) {
    score += 60;
    reasons.push('chapter_number');
  }

  if (
    chapter.originalScienceChapterNumber
    && chapter.originalScienceChapterNumber !== chapter.number
    && chapterNumbers.includes(chapter.originalScienceChapterNumber)
  ) {
    score += 45;
    reasons.push('original_science_chapter_number');
  }

  if (titleText && normalizedText.includes(titleText)) {
    score += 90;
    reasons.push('chapter_title');
  } else if (overlap > 0) {
    score += overlap * 20;
    reasons.push('chapter_title_tokens');
  }

  if (sectionHint && sectionHint === chapter.sectionId) {
    score += 35;
    reasons.push('section_hint');
  } else if (sectionHint) {
    score -= 25;
  }

  if (subjectHint && subjectHint === chapter.subjectId) {
    score += 10;
    reasons.push('subject_hint');
  }

  return {
    chapter,
    score,
    reasons,
  };
};

const toPublicChapter = (chapter) => ({
  chapterId: chapter.chapterId,
  number: chapter.number,
  originalScienceChapterNumber: chapter.originalScienceChapterNumber || null,
  title: chapter.title,
  subjectId: chapter.subjectId,
  subjectTitle: chapter.subjectTitle,
  sectionId: chapter.sectionId,
  sectionTitle: chapter.sectionTitle,
  sourcePath: chapter.sourcePath,
  topicCount: chapter.topicCount,
  coreTopicCount: chapter.coreTopicCount,
});

const buildResult = ({ status, match = null, matches = [], reason }) => ({
  status,
  chapter: match ? toPublicChapter(match.chapter) : null,
  matches: matches.map((item) => ({
    chapter: toPublicChapter(item.chapter),
    score: item.score,
    reasons: item.reasons,
  })),
  reason,
});

export const resolveChapter = (curriculumIndex, message) => {
  const normalized = normalizeMessage(message);
  const normalizedText = normalizeSearchText(normalized.normalizedText);
  const chapterNumbers = extractChapterNumbers(normalizedText);

  if (!normalizedText) {
    return buildResult({
      status: 'not_found',
      reason: 'Empty message.',
    });
  }

  const matches = flattenChapters(curriculumIndex)
    .map((chapter) =>
      createChapterMatch({
        chapter,
        normalizedText,
        sectionHint: normalized.sectionHint,
        subjectHint: normalized.subjectHint,
        chapterNumbers,
      })
    )
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  if (matches.length === 0) {
    return buildResult({
      status: 'not_found',
      reason: 'No chapter matched the message.',
    });
  }

  const bestScore = matches[0].score;
  const topMatches = matches.filter((match) => match.score === bestScore);

  if (topMatches.length > 1) {
    return buildResult({
      status: 'ambiguous',
      matches: topMatches,
      reason: 'Multiple chapters matched equally well.',
    });
  }

  return buildResult({
    status: 'resolved',
    match: matches[0],
    matches: matches.slice(0, 5),
    reason: 'Best chapter match selected.',
  });
};

export const findChapterById = (curriculumIndex, chapterId) =>
  flattenChapters(curriculumIndex).find((chapter) => chapter.chapterId === chapterId) || null;
