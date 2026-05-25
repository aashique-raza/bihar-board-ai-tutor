/**
 * inspectMarkdownLoader.js
 *
 * Inspection script for the Markdown loader.
 * Run via: npm run inspect:loader
 *
 * Prints statistics about all loaded study documents:
 * heading counts, word counts, metadata validity, section breakdown.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hasNativeLangChainLazyLoad,
  loadMarkdownDocuments,
  validateMarkdownDocument,
} from '../rag/markdownLoader.js';

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
  if (!content) return 0;
  return content.split(/\r?\n/).length;
};

const countParagraphs = (content) =>
  content.split(/\r?\n\s*\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean).length;

const getHeadings = (content) => {
  const headingPattern = /^(#{1,4})\s+(.+)$/gm;
  const headings = [];
  let match;
  while ((match = headingPattern.exec(content)) !== null) {
    headings.push({ level: match[1].length, text: match[2].trim() });
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
      H1: headings.filter((h) => h.level === 1).length,
      H2: headings.filter((h) => h.level === 2).length,
      H3: headings.filter((h) => h.level === 3).length,
      H4: headings.filter((h) => h.level === 4).length,
    },
    headings,
  };
};

const groupBySection = (docs) =>
  docs.reduce((groups, doc) => {
    const section = doc.metadata.section;
    if (!groups[section]) groups[section] = [];
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
  const sortedByLength = [...docs].sort((a, b) => statsById.get(a.id).characterLength - statsById.get(b.id).characterLength);
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
  console.log(`smallest document: ${smallest.metadata.file_name} (${statsById.get(smallest.id).characterLength})`);
  console.log(`largest document: ${largest.metadata.file_name} (${statsById.get(largest.id).characterLength})`);
  console.log(`lazy loading mode: ${lazyMode}`);
  console.log('');
};

const printValidationSummary = (docs) => {
  separator();
  console.log('VALIDATION SUMMARY');
  separator();
  const validationResults = docs.map((doc) => ({ doc, validation: validateMarkdownDocument(doc) }));
  for (const { doc, validation } of validationResults) {
    console.log(`${doc.metadata.file_name}: ${validation.valid ? 'VALID' : 'INVALID'}`);
    if (!validation.valid) {
      for (const error of validation.errors) console.log(`- ${error}`);
    }
  }
  console.log('');
  return validationResults;
};

const docs = await loadMarkdownDocuments(baseDataDir);
const lazyMode = hasNativeLangChainLazyLoad(baseDataDir) ? 'native LangChain lazyLoad' : 'custom async generator fallback';
const statsById = new Map(docs.map((doc) => [doc.id, getDocumentStats(doc)]));
printOverallSummary(docs, statsById, lazyMode);
const validationResults = printValidationSummary(docs);
const validCount = validationResults.filter((result) => result.validation.valid).length;
const invalidCount = validationResults.length - validCount;
console.log('LOADER INSPECTION REPORT');
console.log(`Documents loaded: ${docs.length}, Valid: ${validCount}, Invalid: ${invalidCount}`);
console.log(`Status: ${invalidCount === 0 ? 'READY_FOR_CHUNKING' : 'NOT_READY_FOR_CHUNKING'}`);
