/**
 * curriculumIndexBuilder.js
 *
 * Builds a structured curriculum index from loaded Markdown documents.
 * Extracts subjects, sections, chapters, and topics by parsing heading structure.
 *
 * NOTE: Used only by build scripts — not part of the runtime server API.
 */

import { Document } from '@langchain/core/documents';

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/;
const IMPORTANT_HEADING_LEVELS = new Set([1, 2, 3, 4]);

const SUBJECT_ORDER = ['Science'];
const SECTION_ORDER = ['Physics', 'Chemistry', 'Biology'];

const normalizeIdPart = (value) =>
  String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const byConfiguredOrder = (order, getValue) => (left, right) => {
  const leftIndex = order.indexOf(getValue(left));
  const rightIndex = order.indexOf(getValue(right));
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }
  return getValue(left).localeCompare(getValue(right));
};

const getOrCreate = (map, key, createValue) => {
  if (!map.has(key)) map.set(key, createValue());
  return map.get(key);
};

const createSubjectId = (subject) => normalizeIdPart(subject);
const createSectionId = (section) => normalizeIdPart(section);
const createChapterId = (metadata) =>
  [createSubjectId(metadata.subject), createSectionId(metadata.section), `chapter-${String(metadata.chapter_no).padStart(2, '0')}`].join('.');
const createTopicId = (chapterId, topicIndex) => `${chapterId}.topic-${String(topicIndex).padStart(2, '0')}`;
const cleanHeadingTitle = (title) => String(title || '').replace(/^chapter\s+\d+\s*:\s*/i, '').trim();
const normalizeText = (value) => String(value || '').trim().toLowerCase();
const getHeadingPath = (stack, fallbackTitle) => !stack.length ? fallbackTitle : stack.map((h) => h.title).join(' > ');

const collectHeadingTopics = (doc) => {
  const lines = String(doc.pageContent || '').split(/\r?\n/);
  const stack = [];
  const topics = [];
  for (const line of lines) {
    const match = HEADING_PATTERN.exec(line);
    if (!match) continue;
    const level = match[1].length;
    const rawTitle = match[2].trim();
    while (stack.length > 0 && stack.at(-1).level >= level) stack.pop();
    stack.push({ level, title: rawTitle });
    if (!IMPORTANT_HEADING_LEVELS.has(level)) continue;
    const title = cleanHeadingTitle(rawTitle);
    if (!title) continue;
    topics.push({ title, headingLevel: level, headingPath: getHeadingPath(stack, doc.metadata.chapter_title), parentHeading: stack.length > 1 ? stack.at(-2).title : null });
  }
  return topics;
};

const isRevisionHeading = (text) => /\b(important|formula|formulas|unit|units|definition|definitions|comparison|comparisons|flowchart|flowcharts|exam|summary|mistake|mistakes)\b/i.test(text);
const isPracticeHeading = (text) => /\b(question|questions|exercise|mcq|answer|answers|numerical|numericals)\b/i.test(text);
const isReferenceHeading = (text) => /\b(keyword|keywords|glossary)\b/i.test(text);

const getTopicRole = (topic) => {
  const headingPath = normalizeText(topic.headingPath);
  const title = normalizeText(topic.title);
  if (topic.headingLevel === 1) return /^part\s+\d+/i.test(topic.title) ? 'core' : 'chapter';
  if (title.includes('chapter overview') || title === 'overview') return 'overview';
  if (isPracticeHeading(headingPath)) return 'practice';
  if (isReferenceHeading(headingPath)) return 'reference';
  if (isRevisionHeading(headingPath)) return 'revision';
  if (topic.headingLevel === 2) return 'core';
  if (topic.headingLevel > 2) return 'subtopic';
  return 'support';
};

const createRagHints = ({ chapterTitle, title, headingPath }) => {
  const hints = new Set([title, `${chapterTitle} ${title}`, headingPath]);
  return [...hints].map((hint) => hint.replace(/\s+/g, ' ').trim()).filter(Boolean);
};

const createChapter = (doc) => {
  const metadata = doc.metadata;
  const chapterId = createChapterId(metadata);
  const headingTopics = collectHeadingTopics(doc);
  const topics = headingTopics.map((topic, index) => ({
    topicId: createTopicId(chapterId, index + 1), title: topic.title, order: index + 1,
    headingLevel: topic.headingLevel, headingPath: topic.headingPath, parentHeading: topic.parentHeading,
    role: getTopicRole(topic), sourcePath: metadata.source_path, fileName: metadata.file_name,
    ragHints: createRagHints({ chapterTitle: metadata.chapter_title, title: topic.title, headingPath: topic.headingPath }),
  }));
  return {
    chapterId, number: metadata.chapter_no, originalScienceChapterNumber: metadata.original_science_chapter_no,
    title: metadata.chapter_title, sourcePath: metadata.source_path, fileName: metadata.file_name,
    topicCount: topics.length, coreTopicCount: topics.filter((topic) => topic.role === 'core').length, topics,
  };
};

const createEmptyIndex = () => ({
  version: 1, generatedAt: new Date().toISOString(), source: { type: 'curated_markdown' }, subjects: [],
});

export const buildCurriculumIndex = (documents) => {
  const index = createEmptyIndex();
  const subjectsById = new Map();
  for (const doc of documents) {
    const metadata = doc.metadata;
    const subjectId = createSubjectId(metadata.subject);
    const sectionId = createSectionId(metadata.section);
    const subject = getOrCreate(subjectsById, subjectId, () => ({ subjectId, title: metadata.subject, sectionsById: new Map() }));
    const section = getOrCreate(subject.sectionsById, sectionId, () => ({ sectionId, title: metadata.section, chapters: [] }));
    section.chapters.push(createChapter(doc));
  }
  index.subjects = [...subjectsById.values()]
    .sort(byConfiguredOrder(SUBJECT_ORDER, (s) => s.title))
    .map((subject) => ({
      subjectId: subject.subjectId, title: subject.title,
      sections: [...subject.sectionsById.values()]
        .sort(byConfiguredOrder(SECTION_ORDER, (s) => s.title))
        .map((section) => ({ ...section, chapters: section.chapters.sort((a, b) => a.number - b.number) })),
    }));
  return index;
};

export const createCurriculumTopicDocuments = (curriculumIndex) => {
  const documents = [];
  for (const subject of curriculumIndex.subjects || []) {
    for (const section of subject.sections || []) {
      for (const chapter of section.chapters || []) {
        for (const topic of chapter.topics || []) {
          documents.push(new Document({
            pageContent: [`Subject: ${subject.title}`, `Section: ${section.title}`, `Chapter: ${chapter.title}`, `Topic: ${topic.title}`, `Heading path: ${topic.headingPath}`, `Role: ${topic.role}`, `RAG hints: ${topic.ragHints.join(', ')}`].join('\n'),
            metadata: { subjectId: subject.subjectId, subjectTitle: subject.title, sectionId: section.sectionId, sectionTitle: section.title, chapterId: chapter.chapterId, chapterTitle: chapter.title, chapterNumber: chapter.number, topicId: topic.topicId, topicTitle: topic.title, topicOrder: topic.order, topicRole: topic.role, headingPath: topic.headingPath, sourcePath: topic.sourcePath },
          }));
        }
      }
    }
  }
  return documents;
};

export const validateCurriculumIndex = (curriculumIndex) => {
  const errors = [];
  if (!curriculumIndex || typeof curriculumIndex !== 'object') return { valid: false, errors: ['Curriculum index must be an object.'] };
  if (!Array.isArray(curriculumIndex.subjects) || curriculumIndex.subjects.length === 0) errors.push('subjects must be a non-empty array.');
  for (const subject of curriculumIndex.subjects || []) {
    if (!subject.subjectId || !subject.title) errors.push('Each subject must include subjectId and title.');
    if (!Array.isArray(subject.sections) || subject.sections.length === 0) errors.push(`Subject ${subject.subjectId} must include sections.`);
    for (const section of subject.sections || []) {
      if (!section.sectionId || !section.title) errors.push(`Section in ${subject.subjectId} must include sectionId and title.`);
      if (!Array.isArray(section.chapters) || section.chapters.length === 0) errors.push(`Section ${section.sectionId} must include chapters.`);
      for (const chapter of section.chapters || []) {
        if (!chapter.chapterId || !chapter.title || !Number.isInteger(chapter.number)) errors.push(`Chapter in ${section.sectionId} is missing id, title, or number.`);
        if (!Array.isArray(chapter.topics) || chapter.topics.length === 0) errors.push(`Chapter ${chapter.chapterId} must include topics.`);
        for (const topic of chapter.topics || []) {
          if (!topic.topicId || !topic.title || !Number.isInteger(topic.order)) errors.push(`Topic in ${chapter.chapterId} is missing id, title, or order.`);
          if (!topic.headingPath || !Array.isArray(topic.ragHints) || topic.ragHints.length === 0) errors.push(`Topic ${topic.topicId} must include headingPath and ragHints.`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
};
