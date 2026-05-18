import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMarkdownDocuments } from '../rag/indexing/loaders/markdownLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const scienceContentDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');

const SUBJECT_ORDER = ['Science'];
const SECTION_ORDER = ['Physics', 'Chemistry', 'Biology'];

let cachedStudyMap = null;

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const byConfiguredOrder = (order, getValue) => (left, right) => {
  const leftIndex = order.indexOf(getValue(left));
  const rightIndex = order.indexOf(getValue(right));

  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex)
      - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }

  return getValue(left).localeCompare(getValue(right));
};

const createChapterId = (metadata) =>
  [
    slugify(metadata.subject),
    slugify(metadata.section),
    `chapter-${String(metadata.chapter_no).padStart(2, '0')}`,
  ].join('.');

const createSectionId = (sectionTitle) => slugify(sectionTitle);

const createSubjectId = (subjectTitle) => slugify(subjectTitle);

const createChapterItem = (doc) => {
  const metadata = doc.metadata;

  return {
    id: createChapterId(metadata),
    number: metadata.chapter_no,
    title: metadata.chapter_title,
    originalScienceChapterNumber: metadata.original_science_chapter_no,
  };
};

const createChapterLookupItem = ({ subject, section, chapter }) => ({
  ...chapter,
  subjectId: subject.id,
  subjectTitle: subject.title,
  sectionId: section.id,
  sectionTitle: section.title,
  metadataFilter: {
    subject: subject.title,
    section: section.title,
    chapter_no: chapter.number,
  },
});

const getOrCreateSection = (sectionsById, sectionTitle) => {
  const id = createSectionId(sectionTitle);

  if (!sectionsById.has(id)) {
    sectionsById.set(id, {
      id,
      title: sectionTitle,
      chapters: [],
    });
  }

  return sectionsById.get(id);
};

const getOrCreateSubject = (subjectsById, subjectTitle) => {
  const id = createSubjectId(subjectTitle);

  if (!subjectsById.has(id)) {
    subjectsById.set(id, {
      id,
      title: subjectTitle,
      sectionsById: new Map(),
    });
  }

  return subjectsById.get(id);
};

const buildStudyMapFromDocuments = (documents) => {
  const subjectsById = new Map();

  for (const doc of documents) {
    const metadata = doc.metadata;
    const subject = getOrCreateSubject(subjectsById, metadata.subject);
    const section = getOrCreateSection(subject.sectionsById, metadata.section);

    section.chapters.push(createChapterItem(doc));
  }

  const subjects = [...subjectsById.values()]
    .sort(byConfiguredOrder(SUBJECT_ORDER, (subject) => subject.title))
    .map((subject) => ({
      id: subject.id,
      title: subject.title,
      sections: [...subject.sectionsById.values()]
        .sort(byConfiguredOrder(SECTION_ORDER, (section) => section.title))
        .map((section) => ({
          ...section,
          chapters: section.chapters.sort((left, right) => left.number - right.number),
        })),
    }));

  return {
    defaultStudyMode: 'global',
    supportedStudyModes: ['global', 'focus'],
    focusStudy: {
      type: 'chapter',
      subjects,
    },
  };
};

export const getStudyMap = async ({ refresh = false } = {}) => {
  if (cachedStudyMap && !refresh) {
    return cachedStudyMap;
  }

  const documents = await loadMarkdownDocuments(scienceContentDir);

  cachedStudyMap = buildStudyMapFromDocuments(documents);

  return cachedStudyMap;
};

export const findStudyMapChapter = async (chapterId) => {
  const studyMap = await getStudyMap();

  for (const subject of studyMap.focusStudy.subjects) {
    for (const section of subject.sections) {
      const chapter = section.chapters.find((item) => item.id === chapterId);

      if (chapter) {
        return createChapterLookupItem({ subject, section, chapter });
      }
    }
  }

  return null;
};
