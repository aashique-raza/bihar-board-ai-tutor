import path from 'node:path';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import {
  loadMarkdownDocuments,
  loadMarkdownDocumentsLazy,
} from '../loaders/markdownLoader.js';

export const DEFAULT_CHUNK_CONFIG = {
  chunkSize: 1200,
  chunkOverlap: 180,
  minChunkSize: 300,
  maxChunkSize: 1800,
};

const MARKDOWN_SEPARATORS = [
  '\n## ',
  '\n### ',
  '\n#### ',
  '\n\n',
  '\n',
  '. ',
  ' ',
  '',
];

const REQUIRED_CHUNK_METADATA = [
  'board',
  'class',
  'subject',
  'section',
  'chapter_no',
  'original_science_chapter_no',
  'chapter_title',
  'source_path',
  'file_name',
  'chunk_index',
  'chunk_id',
  'heading_path',
  'heading_level',
  'content_type',
  'char_count',
  'word_count',
  'line_count',
  'splitter',
  'chunk_size_config',
  'chunk_overlap_config',
];

export const ALLOWED_CONTENT_TYPES = [
  'concept',
  'definition',
  'formula',
  'example',
  'activity',
  'question',
  'table',
  'diagram_reference',
  'mixed',
];

const mergeConfig = (options = {}) => ({
  ...DEFAULT_CHUNK_CONFIG,
  ...options,
});

const countWords = (content) => content.match(/\S+/g)?.length || 0;

const countLines = (content) => (content ? content.split(/\r?\n/).length : 0);

const padNumber = (value, size) => String(value).padStart(size, '0');

const normalizeSection = (section) => section.toLowerCase();

const makeChunkId = (metadata, chunkIndex) =>
  `${normalizeSection(metadata.section)}-chapter-${padNumber(metadata.chapter_no, 2)}-chunk-${padNumber(chunkIndex, 3)}`;

const createContextHeader = (doc, headingPath) => `[Context]
Board: ${doc.metadata.board}
Class: ${doc.metadata.class}
Subject: ${doc.metadata.subject}
Section: ${doc.metadata.section}
Chapter: ${doc.metadata.chapter_title}
Topic: ${headingPath}

[Content]
`;

const isOnlyHeadingText = (content) => {
  const meaningfulLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    meaningfulLines.length > 0 &&
    meaningfulLines.every((line) => /^#{1,6}\s+\S+/.test(line))
  );
};

const isMeaningfulRawContent = (content) => {
  const trimmed = content.trim();

  if (!trimmed) {
    return false;
  }

  if (isOnlyHeadingText(trimmed)) {
    return false;
  }

  return trimmed.replace(/^#{1,6}\s+.+$/gm, '').replace(/[-*_`\s|]/g, '').length > 0;
};

const cloneHeadingStack = (stack) => stack.map((heading) => ({ ...heading }));

const getHeadingPath = (stack, fallbackTitle) => {
  if (stack.length === 0) {
    return fallbackTitle;
  }

  return stack.map((heading) => heading.text).join(' > ');
};

const parseHeadingSections = (doc) => {
  const lines = doc.pageContent.split(/\r?\n/);
  const sections = [];
  const headingStack = [];
  let currentSection = null;

  const pushCurrentSection = () => {
    if (currentSection && isMeaningfulRawContent(currentSection.contentLines.join('\n'))) {
      sections.push({
        headingPath: currentSection.headingPath,
        headingLevel: currentSection.headingLevel,
        text: currentSection.contentLines.join('\n').trim(),
      });
    }
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

    if (headingMatch) {
      pushCurrentSection();

      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      while (headingStack.length > 0 && headingStack.at(-1).level >= level) {
        headingStack.pop();
      }

      headingStack.push({ level, text });

      currentSection = {
        headingPath: getHeadingPath(headingStack, doc.metadata.chapter_title),
        headingLevel: level,
        headingStack: cloneHeadingStack(headingStack),
        contentLines: [line],
      };

      continue;
    }

    if (!currentSection) {
      currentSection = {
        headingPath: doc.metadata.chapter_title,
        headingLevel: 0,
        headingStack: [],
        contentLines: [],
      };
    }

    currentSection.contentLines.push(line);
  }

  pushCurrentSection();

  return sections.length > 0
    ? sections
    : [
        {
          headingPath: doc.metadata.chapter_title,
          headingLevel: 1,
          text: doc.pageContent.trim(),
        },
      ];
};

const mergeSmallSections = (sections, config) => {
  const mergedSections = [];
  let buffer = null;

  const flushBuffer = () => {
    if (buffer && isMeaningfulRawContent(buffer.text)) {
      mergedSections.push(buffer);
    }

    buffer = null;
  };

  for (const section of sections) {
    const sectionLength = section.text.length;

    if (sectionLength > config.chunkSize) {
      flushBuffer();
      mergedSections.push(section);
      continue;
    }

    if (!buffer) {
      buffer = { ...section };
      continue;
    }

    const mergedText = `${buffer.text}\n\n${section.text}`.trim();
    const canMerge = mergedText.length <= config.chunkSize;

    if (canMerge) {
      buffer = {
        ...buffer,
        text: mergedText,
        headingLevel: Math.min(buffer.headingLevel || section.headingLevel, section.headingLevel),
      };

      continue;
    }

    flushBuffer();
    buffer = { ...section };

    if (buffer.text.length >= config.minChunkSize) {
      flushBuffer();
    }
  }

  flushBuffer();

  return mergedSections;
};

const detectContentType = (headingPath, rawContent) => {
  const text = `${headingPath}\n${rawContent}`.toLowerCase();
  const matchedTypes = new Set();

  if (/\bdefinition\b|\bmeans\b|\bis called\b|\bknown as\b/.test(text)) {
    matchedTypes.add('definition');
  }

  if (/\bexample\b|\bnumerical\b|\bsolution\b|\bgiven\b/.test(text)) {
    matchedTypes.add('example');
  }

  if (/\bactivity\b/.test(text)) {
    matchedTypes.add('activity');
  }

  if (/\bquestion\b|\bexercise\b|\bshort answer\b|\blong answer\b|\bmcq\b/.test(text)) {
    matchedTypes.add('question');
  }

  if (/^\s*\|.+\|\s*$/m.test(rawContent)) {
    matchedTypes.add('table');
  }

  if (/\bfigure\b|\bdiagram\b|\bshown in figure\b|\bfig\./.test(text)) {
    matchedTypes.add('diagram_reference');
  }

  if (
    /[A-Za-z0-9)]\s*=\s*[A-Za-z0-9(]/.test(rawContent) ||
    /\b[VPIHRE]\s*=\s*[A-Za-z0-9]/.test(rawContent) ||
    /--.*-->|â†’|→/.test(rawContent)
  ) {
    matchedTypes.add('formula');
  }

  if (matchedTypes.size > 1) {
    return 'mixed';
  }

  return [...matchedTypes][0] || 'concept';
};

const createChunk = (doc, rawContent, sectionInfo, chunkIndex, config, splitter) => {
  const cleanedRawContent = rawContent.trim();
  const headingPath = sectionInfo.headingPath || doc.metadata.chapter_title;
  const pageContent = `${createContextHeader(doc, headingPath)}${cleanedRawContent}`;
  const chunkId = makeChunkId(doc.metadata, chunkIndex);

  return {
    id: chunkId,
    pageContent,
    metadata: {
      board: doc.metadata.board,
      class: doc.metadata.class,
      subject: doc.metadata.subject,
      section: doc.metadata.section,
      chapter_no: doc.metadata.chapter_no,
      original_science_chapter_no: doc.metadata.original_science_chapter_no,
      chapter_title: doc.metadata.chapter_title,
      source_path: doc.metadata.source_path,
      file_name: doc.metadata.file_name,
      chunk_index: chunkIndex,
      chunk_id: chunkId,
      heading_path: headingPath,
      heading_level: sectionInfo.headingLevel || 0,
      content_type: detectContentType(headingPath, cleanedRawContent),
      char_count: pageContent.length,
      word_count: countWords(pageContent),
      line_count: countLines(pageContent),
      splitter,
      chunk_size_config: config.chunkSize,
      chunk_overlap_config: config.chunkOverlap,
    },
  };
};

const createSplitter = (config) =>
  new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    separators: MARKDOWN_SEPARATORS,
  });

const splitSection = async (section, config) => {
  if (section.text.length <= config.chunkSize) {
    return [{ text: section.text, splitter: 'heading_merge' }];
  }

  const splitter = createSplitter(config);
  const splitTexts = await splitter.splitText(section.text);

  return splitTexts
    .map((text) => text.trim())
    .filter(isMeaningfulRawContent)
    .map((text) => ({
      text,
      splitter: 'recursive_character',
    }));
};

const createChunksForDocument = async (doc, config) => {
  const sections = mergeSmallSections(parseHeadingSections(doc), config);
  const chunks = [];
  let chunkIndex = 1;

  for (const section of sections) {
    const splitSections = await splitSection(section, config);

    for (const split of splitSections) {
      if (!isMeaningfulRawContent(split.text)) {
        continue;
      }

      chunks.push(createChunk(doc, split.text, section, chunkIndex, config, split.splitter));
      chunkIndex += 1;
    }
  }

  return chunks;
};

export const createMarkdownChunks = async (documents, options = {}) => {
  const config = mergeConfig(options);
  const chunks = [];

  for (const doc of documents) {
    chunks.push(...(await createChunksForDocument(doc, config)));
  }

  return chunks;
};

export const createMarkdownChunksFromBaseDir = async (baseDir, options = {}) => {
  const documents = await loadMarkdownDocuments(baseDir);
  return createMarkdownChunks(documents, options);
};

export const createMarkdownChunksLazy = async function* (baseDir, options = {}) {
  const config = mergeConfig(options);

  for await (const doc of loadMarkdownDocumentsLazy(baseDir)) {
    const chunks = await createChunksForDocument(doc, config);

    for (const chunk of chunks) {
      yield chunk;
    }
  }
};

export const validateChunk = (chunk) => {
  const errors = [];

  if (!chunk.id) {
    errors.push('Chunk id is missing.');
  }

  if (!chunk.pageContent || chunk.pageContent.trim().length === 0) {
    errors.push('pageContent is missing or empty.');
  }

  if (!chunk.pageContent?.includes('[Context]')) {
    errors.push('pageContent is missing [Context].');
  }

  if (!chunk.pageContent?.includes('[Content]')) {
    errors.push('pageContent is missing [Content].');
  }

  if (chunk.pageContent?.trimStart().startsWith('---')) {
    errors.push('pageContent starts with YAML frontmatter marker.');
  }

  if (!chunk.metadata) {
    errors.push('metadata is missing.');
  }

  for (const field of REQUIRED_CHUNK_METADATA) {
    if (
      chunk.metadata?.[field] === undefined ||
      chunk.metadata?.[field] === null ||
      chunk.metadata?.[field] === ''
    ) {
      errors.push(`Missing required metadata field: ${field}`);
    }
  }

  if (chunk.metadata?.chunk_id !== chunk.id) {
    errors.push('metadata.chunk_id does not equal chunk.id.');
  }

  if (!(chunk.metadata?.char_count > 0)) {
    errors.push('metadata.char_count must be greater than 0.');
  }

  if (!(chunk.metadata?.word_count > 0)) {
    errors.push('metadata.word_count must be greater than 0.');
  }

  if (!chunk.metadata?.heading_path) {
    errors.push('metadata.heading_path is missing.');
  }

  if (!ALLOWED_CONTENT_TYPES.includes(chunk.metadata?.content_type)) {
    errors.push(`Invalid content_type: ${chunk.metadata?.content_type}`);
  }

  const contentPart = chunk.pageContent?.split('[Content]')[1]?.trim() || '';

  if (!isMeaningfulRawContent(contentPart)) {
    errors.push('Chunk content is empty, heading-only, or context-only.');
  }

  if (chunk.pageContent?.length > (chunk.metadata?.chunk_size_config || DEFAULT_CHUNK_CONFIG.chunkSize) + 1300) {
    errors.push('Chunk is far above configured chunk size.');
  }

  if (chunk.pageContent?.length > 2500) {
    errors.push('Chunk exceeds 2500 characters.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
