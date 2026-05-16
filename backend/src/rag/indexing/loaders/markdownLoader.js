import fs from 'node:fs/promises';
import path from 'node:path';

import { DirectoryLoader } from '@langchain/classic/document_loaders/fs/directory';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';

const REQUIRED_METADATA_FIELDS = [
  'board',
  'class',
  'subject',
  'section',
  'chapter_no',
  'original_science_chapter_no',
  'chapter_title',
  'language',
  'source_type',
];

const SECTION_RULES = {
  chemistry: {
    section: 'Chemistry',
    chapterStart: 1,
    chapterEnd: 5,
    originalStart: 1,
    originalEnd: 5,
  },
  biology: {
    section: 'Biology',
    chapterStart: 1,
    chapterEnd: 4,
    originalStart: 6,
    originalEnd: 9,
  },
  physics: {
    section: 'Physics',
    chapterStart: 1,
    chapterEnd: 7,
    originalStart: 10,
    originalEnd: 16,
  },
};

export const normalizePath = (filePath) => filePath.replaceAll(path.sep, '/');

const shouldLoadMarkdownFile = (filePath) => {
  const fileName = path.basename(filePath);

  return (
    path.extname(fileName).toLowerCase() === '.md' &&
    fileName.toLowerCase() !== 'readme.md' &&
    fileName !== '.gitkeep'
  );
};

const stripYamlQuotes = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const parseYamlScalar = (value) => {
  const trimmed = stripYamlQuotes(value.trim());

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return trimmed;
};

export const parseYamlFrontmatter = (content) => {
  const normalizedContent = content.replace(/^\uFEFF/, '');

  if (!normalizedContent.startsWith('---')) {
    return {
      metadata: {},
      content: normalizedContent.trim(),
      hadFrontmatter: false,
    };
  }

  const lines = normalizedContent.split(/\r?\n/);
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');

  if (endIndex === -1) {
    throw new Error('YAML frontmatter opening marker found without closing marker.');
  }

  const metadata = {};
  const frontmatterLines = lines.slice(1, endIndex);

  for (const line of frontmatterLines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');

    if (separatorIndex === -1) {
      throw new Error(`Unsupported YAML frontmatter line: ${line}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);

    metadata[key] = parseYamlScalar(value);
  }

  return {
    metadata,
    content: lines.slice(endIndex + 1).join('\n').trim(),
    hadFrontmatter: true,
  };
};

const getSectionFolder = (sourcePath) => path.basename(path.dirname(sourcePath)).toLowerCase();

const getExpectedOriginalChapterNo = (folderSection, chapterNo) => {
  const rule = SECTION_RULES[folderSection];

  if (!rule) {
    return undefined;
  }

  return rule.originalStart + chapterNo - 1;
};

const createStableId = (metadata) =>
  `${metadata.section}-${metadata.chapter_no}-${metadata.file_name}`;

const normalizeDocument = (doc, baseDir) => {
  const langChainSource = doc.metadata?.source || doc.metadata?.filePath || doc.metadata?.file_path;
  const absoluteSourcePath = path.isAbsolute(langChainSource)
    ? langChainSource
    : path.resolve(langChainSource);
  const parsed = parseYamlFrontmatter(doc.pageContent || '');
  const sourcePath = normalizePath(path.relative(process.cwd(), absoluteSourcePath));
  const fileName = path.basename(absoluteSourcePath);

  const metadata = {
    ...parsed.metadata,
    source_path: sourcePath,
    file_name: fileName,
  };

  const normalizedDoc = {
    id: createStableId(metadata),
    pageContent: parsed.content,
    metadata,
  };

  const validation = validateMarkdownDocument(normalizedDoc, {
    baseDir,
    absoluteSourcePath,
  });

  if (!validation.valid) {
    throw new Error(
      `Invalid markdown document metadata in ${sourcePath}:\n- ${validation.errors.join('\n- ')}`
    );
  }

  return normalizedDoc;
};

const discoverMarkdownFiles = async function* (dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const sortedEntries = entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* discoverMarkdownFiles(entryPath);
      continue;
    }

    if (entry.isFile() && shouldLoadMarkdownFile(entryPath)) {
      yield entryPath;
    }
  }
};

export const hasNativeLangChainLazyLoad = (baseDir) => {
  const loader = new DirectoryLoader(baseDir, {
    '.md': (filePath) => new TextLoader(filePath),
  });

  return typeof loader.lazyLoad === 'function';
};

export const loadMarkdownDocuments = async (baseDir) => {
  const absoluteBaseDir = path.resolve(baseDir);
  const loader = new DirectoryLoader(absoluteBaseDir, {
    '.md': (filePath) => new TextLoader(filePath),
  });

  const loadedDocs = await loader.load();

  return loadedDocs
    .filter((doc) => shouldLoadMarkdownFile(doc.metadata?.source || ''))
    .sort((left, right) =>
      (left.metadata?.source || '').localeCompare(right.metadata?.source || '')
    )
    .map((doc) => normalizeDocument(doc, absoluteBaseDir));
};

export const loadMarkdownDocumentsLazy = async function* (baseDir) {
  const absoluteBaseDir = path.resolve(baseDir);
  const directoryLoader = new DirectoryLoader(absoluteBaseDir, {
    '.md': (filePath) => new TextLoader(filePath),
  });

  if (typeof directoryLoader.lazyLoad === 'function') {
    for await (const doc of directoryLoader.lazyLoad()) {
      if (shouldLoadMarkdownFile(doc.metadata?.source || '')) {
        yield normalizeDocument(doc, absoluteBaseDir);
      }
    }

    return;
  }

  for await (const filePath of discoverMarkdownFiles(absoluteBaseDir)) {
    const textLoader = new TextLoader(filePath);
    const [doc] = await textLoader.load();

    yield normalizeDocument(doc, absoluteBaseDir);
  }
};

export const validateMarkdownDocument = (doc, options = {}) => {
  const errors = [];
  const metadata = doc.metadata || {};

  for (const field of REQUIRED_METADATA_FIELDS) {
    if (metadata[field] === undefined || metadata[field] === null || metadata[field] === '') {
      errors.push(`Missing required metadata field: ${field}`);
    }
  }

  if (!doc.pageContent || doc.pageContent.trim().length === 0) {
    errors.push('pageContent is empty.');
  }

  if (doc.pageContent?.trimStart().startsWith('---')) {
    errors.push('YAML frontmatter was not removed from pageContent.');
  }

  if (metadata.board !== 'Bihar Board') {
    errors.push(`board must be "Bihar Board"; received "${metadata.board}".`);
  }

  if (metadata.class !== 10) {
    errors.push(`class must be 10; received "${metadata.class}".`);
  }

  if (metadata.subject !== 'Science') {
    errors.push(`subject must be "Science"; received "${metadata.subject}".`);
  }

  if (metadata.language !== 'English') {
    errors.push(`language must be "English"; received "${metadata.language}".`);
  }

  if (metadata.source_type !== 'cleaned_markdown') {
    errors.push(`source_type must be "cleaned_markdown"; received "${metadata.source_type}".`);
  }

  const absoluteSourcePath = options.absoluteSourcePath
    ? path.resolve(options.absoluteSourcePath)
    : metadata.source_path
      ? path.resolve(process.cwd(), metadata.source_path)
      : '';
  const folderSection = absoluteSourcePath ? getSectionFolder(absoluteSourcePath) : undefined;
  const sectionRule = folderSection ? SECTION_RULES[folderSection] : undefined;

  if (!sectionRule) {
    errors.push(`source_path must be inside chemistry, biology, or physics; received "${metadata.source_path}".`);
  } else if (metadata.section !== sectionRule.section) {
    errors.push(
      `section must match folder "${sectionRule.section}"; received "${metadata.section}".`
    );
  }

  if (!Number.isInteger(metadata.chapter_no)) {
    errors.push(`chapter_no must be an integer; received "${metadata.chapter_no}".`);
  } else if (
    sectionRule &&
    (metadata.chapter_no < sectionRule.chapterStart || metadata.chapter_no > sectionRule.chapterEnd)
  ) {
    errors.push(
      `chapter_no for ${sectionRule.section} must be ${sectionRule.chapterStart}-${sectionRule.chapterEnd}; received ${metadata.chapter_no}.`
    );
  }

  if (!Number.isInteger(metadata.original_science_chapter_no)) {
    errors.push(
      `original_science_chapter_no must be an integer; received "${metadata.original_science_chapter_no}".`
    );
  } else if (
    sectionRule &&
    (metadata.original_science_chapter_no < sectionRule.originalStart ||
      metadata.original_science_chapter_no > sectionRule.originalEnd)
  ) {
    errors.push(
      `original_science_chapter_no for ${sectionRule.section} must be ${sectionRule.originalStart}-${sectionRule.originalEnd}; received ${metadata.original_science_chapter_no}.`
    );
  }

  if (sectionRule && Number.isInteger(metadata.chapter_no)) {
    const expectedOriginal = getExpectedOriginalChapterNo(folderSection, metadata.chapter_no);

    if (metadata.original_science_chapter_no !== expectedOriginal) {
      errors.push(
        `original_science_chapter_no must be ${expectedOriginal} for ${metadata.section} chapter ${metadata.chapter_no}; received ${metadata.original_science_chapter_no}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

