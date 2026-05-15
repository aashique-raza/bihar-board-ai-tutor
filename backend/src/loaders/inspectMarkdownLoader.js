import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hasNativeLangChainLazyLoad,
  loadMarkdownDocuments,
  validateMarkdownDocument,
} from './markdownLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');
const sectionOrder = ['Chemistry', 'Biology', 'Physics'];

const separator = () => console.log('==================================================');

const countWords = (content) => {
  const words = content.match(/\S+/g);
  return words ? words.length : 0;
};

const countLines = (content) => {
  if (!content) {
    return 0;
  }

  return content.split(/\r?\n/).length;
};

const countParagraphs = (content) =>
  content
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length;

const getHeadings = (content) => {
  const headingPattern = /^(#{1,4})\s+(.+)$/gm;
  const headings = [];
  let match;

  while ((match = headingPattern.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
    });
  }

  return headings;
};

const getDocumentStats = (doc) => {
  const headings = getHeadings(doc.pageContent);

  return {
    characterLength: doc.pageContent.length,
    wordCount: countWords(doc.pageContent),
    lineCount: countLines(doc.pageContent),
    paragraphCount: countParagraphs(doc.pageContent),
    headingCount: headings.length,
    headingLevels: {
      H1: headings.filter((heading) => heading.level === 1).length,
      H2: headings.filter((heading) => heading.level === 2).length,
      H3: headings.filter((heading) => heading.level === 3).length,
      H4: headings.filter((heading) => heading.level === 4).length,
    },
    headings,
  };
};

const groupBySection = (docs) =>
  docs.reduce((groups, doc) => {
    const section = doc.metadata.section;

    if (!groups[section]) {
      groups[section] = [];
    }

    groups[section].push(doc);
    return groups;
  }, {});

const printOverallSummary = (docs, statsById, lazyMode) => {
  const sections = [...new Set(docs.map((doc) => doc.metadata.section))];
  const countsBySection = groupBySection(docs);
  const totalCharacters = docs.reduce((total, doc) => total + statsById.get(doc.id).characterLength, 0);
  const totalWords = docs.reduce((total, doc) => total + statsById.get(doc.id).wordCount, 0);
  const totalLines = docs.reduce((total, doc) => total + statsById.get(doc.id).lineCount, 0);
  const averageCharacters = docs.length === 0 ? 0 : Math.round(totalCharacters / docs.length);
  const sortedByLength = [...docs].sort(
    (left, right) =>
      statsById.get(left.id).characterLength - statsById.get(right.id).characterLength
  );
  const smallest = sortedByLength[0];
  const largest = sortedByLength.at(-1);

  separator();
  console.log('OVERALL SUMMARY');
  separator();
  console.log(`total documents loaded: ${docs.length}`);
  console.log(`total sections: ${sections.length}`);
  console.log('count by section:');

  for (const section of sectionOrder) {
    console.log(`- ${section}: ${countsBySection[section]?.length || 0}`);
  }

  console.log(`total characters: ${totalCharacters}`);
  console.log(`total words: ${totalWords}`);
  console.log(`total lines: ${totalLines}`);
  console.log(`average characters per document: ${averageCharacters}`);
  console.log(
    `smallest document by character length: ${smallest.metadata.file_name} (${statsById.get(smallest.id).characterLength})`
  );
  console.log(
    `largest document by character length: ${largest.metadata.file_name} (${statsById.get(largest.id).characterLength})`
  );
  console.log(`lazy loading mode: ${lazyMode}`);
  console.log('');
};

const printMetadata = (metadata) => {
  console.log('metadata:');
  console.log(`  board: ${metadata.board}`);
  console.log(`  class: ${metadata.class}`);
  console.log(`  subject: ${metadata.subject}`);
  console.log(`  section: ${metadata.section}`);
  console.log(`  chapter_no: ${metadata.chapter_no}`);
  console.log(`  original_science_chapter_no: ${metadata.original_science_chapter_no}`);
  console.log(`  chapter_title: ${metadata.chapter_title}`);
  console.log(`  language: ${metadata.language}`);
  console.log(`  source_type: ${metadata.source_type}`);
};

const printContentStats = (stats) => {
  console.log('content stats:');
  console.log(`  character length: ${stats.characterLength}`);
  console.log(`  word count: ${stats.wordCount}`);
  console.log(`  line count: ${stats.lineCount}`);
  console.log(`  paragraph count: ${stats.paragraphCount}`);
  console.log(`  heading count: ${stats.headingCount}`);
  console.log(`  H1 count: ${stats.headingLevels.H1}`);
  console.log(`  H2 count: ${stats.headingLevels.H2}`);
  console.log(`  H3 count: ${stats.headingLevels.H3}`);
  console.log(`  H4 count: ${stats.headingLevels.H4}`);
};

const printDocumentDetails = (docs, statsById) => {
  docs.forEach((doc, index) => {
    const stats = statsById.get(doc.id);

    separator();
    console.log(`DOCUMENT ${index + 1}/${docs.length}`);
    separator();
    console.log(`document number: ${index + 1}`);
    console.log(`id: ${doc.id}`);
    console.log(`source_path: ${doc.metadata.source_path}`);
    console.log(`file_name: ${doc.metadata.file_name}`);
    printMetadata(doc.metadata);
    printContentStats(stats);
    console.log('headings list:');

    for (const heading of stats.headings) {
      console.log(`H${heading.level}: ${heading.text}`);
    }

    console.log('content preview:');
    console.log('first 700 characters:');
    console.log(doc.pageContent.slice(0, 700));
    console.log('');
    console.log('last 400 characters:');
    console.log(doc.pageContent.slice(-400));
    console.log('');
  });
};

const printSectionSummary = (docs, statsById) => {
  const groups = groupBySection(docs);

  separator();
  console.log('SECTION-WISE SUMMARY');
  separator();

  for (const section of sectionOrder) {
    const sectionDocs = groups[section] || [];
    const totalCharacters = sectionDocs.reduce(
      (total, doc) => total + statsById.get(doc.id).characterLength,
      0
    );
    const totalHeadings = sectionDocs.reduce(
      (total, doc) => total + statsById.get(doc.id).headingCount,
      0
    );
    const averageCharacters =
      sectionDocs.length === 0 ? 0 : Math.round(totalCharacters / sectionDocs.length);

    console.log(`${section}`);
    console.log(`chapter count: ${sectionDocs.length}`);
    console.log(`total characters: ${totalCharacters}`);
    console.log(`average characters: ${averageCharacters}`);
    console.log(`total headings: ${totalHeadings}`);
    console.log('chapter titles list:');

    for (const doc of sectionDocs) {
      console.log(`- ${doc.metadata.chapter_no}. ${doc.metadata.chapter_title}`);
    }

    console.log('');
  }
};

const printValidationSummary = (docs) => {
  separator();
  console.log('VALIDATION SUMMARY');
  separator();

  const validationResults = docs.map((doc) => ({
    doc,
    validation: validateMarkdownDocument(doc),
  }));

  for (const { doc, validation } of validationResults) {
    console.log(`${doc.metadata.file_name}: ${validation.valid ? 'VALID' : 'INVALID'}`);

    if (!validation.valid) {
      for (const error of validation.errors) {
        console.log(`- ${error}`);
      }
    }
  }

  console.log('');
  return validationResults;
};

const docs = await loadMarkdownDocuments(baseDataDir);
const lazyMode = hasNativeLangChainLazyLoad(baseDataDir)
  ? 'native LangChain lazyLoad'
  : 'custom async generator fallback';
const statsById = new Map(docs.map((doc) => [doc.id, getDocumentStats(doc)]));

printOverallSummary(docs, statsById, lazyMode);
printDocumentDetails(docs, statsById);
printSectionSummary(docs, statsById);
const validationResults = printValidationSummary(docs);

const validCount = validationResults.filter((result) => result.validation.valid).length;
const invalidCount = validationResults.length - validCount;
const sectionsFound = sectionOrder.filter((section) =>
  docs.some((doc) => doc.metadata.section === section)
);
const finalStatus = invalidCount === 0 ? 'READY_FOR_CHUNKING' : 'NOT_READY_FOR_CHUNKING';

console.log('LOADER INSPECTION REPORT');
console.log(`Documents loaded: ${docs.length}`);
console.log(`Valid documents: ${validCount}`);
console.log(`Invalid documents: ${invalidCount}`);
console.log(`Sections found: ${sectionsFound.join(', ')}`);
console.log(`Status: ${finalStatus}`);

