import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMarkdownDocuments } from '../loaders/markdownLoader.js';
import {
  ALLOWED_CONTENT_TYPES,
  createMarkdownChunks,
  validateChunk,
} from './markdownChunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');
const sectionOrder = ['Chemistry', 'Biology', 'Physics'];

const separator = () => console.log('==================================================');

const groupBy = (items, getKey) =>
  items.reduce((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});

const average = (numbers) => {
  if (numbers.length === 0) {
    return 0;
  }

  return Math.round(numbers.reduce((total, value) => total + value, 0) / numbers.length);
};

const contentTypeDistribution = (chunks) => {
  const distribution = Object.fromEntries(ALLOWED_CONTENT_TYPES.map((type) => [type, 0]));

  for (const chunk of chunks) {
    distribution[chunk.metadata.content_type] += 1;
  }

  return distribution;
};

const printDistribution = (distribution) => {
  for (const type of ALLOWED_CONTENT_TYPES) {
    console.log(`- ${type}: ${distribution[type]}`);
  }
};

const getDuplicateIdCount = (chunks) => {
  const ids = chunks.map((chunk) => chunk.id);
  return ids.length - new Set(ids).size;
};

const printOverallSummary = (documents, chunks) => {
  const charCounts = chunks.map((chunk) => chunk.metadata.char_count);
  const smallest = [...chunks].sort((left, right) => left.metadata.char_count - right.metadata.char_count)[0];
  const largest = [...chunks].sort((left, right) => right.metadata.char_count - left.metadata.char_count)[0];

  separator();
  console.log('OVERALL CHUNK SUMMARY');
  separator();
  console.log(`total documents: ${documents.length}`);
  console.log(`total chunks: ${chunks.length}`);
  console.log(`total characters: ${charCounts.reduce((total, value) => total + value, 0)}`);
  console.log(`total words: ${chunks.reduce((total, chunk) => total + chunk.metadata.word_count, 0)}`);
  console.log(`average chunk size: ${average(charCounts)}`);
  console.log(`smallest chunk: ${smallest.id} (${smallest.metadata.char_count})`);
  console.log(`largest chunk: ${largest.id} (${largest.metadata.char_count})`);
  console.log(`chunks under 300 chars: ${chunks.filter((chunk) => chunk.metadata.char_count < 300).length}`);
  console.log(`chunks over 1800 chars: ${chunks.filter((chunk) => chunk.metadata.char_count > 1800).length}`);
  console.log(`chunks over 2500 chars: ${chunks.filter((chunk) => chunk.metadata.char_count > 2500).length}`);
  console.log(`duplicate ids count: ${getDuplicateIdCount(chunks)}`);
  console.log(`empty chunks count: ${chunks.filter((chunk) => chunk.pageContent.trim().length === 0).length}`);
  console.log('');
};

const printSectionSummary = (chunks) => {
  const bySection = groupBy(chunks, (chunk) => chunk.metadata.section);

  separator();
  console.log('SECTION-WISE SUMMARY');
  separator();

  for (const section of sectionOrder) {
    const sectionChunks = bySection[section] || [];
    const charCounts = sectionChunks.map((chunk) => chunk.metadata.char_count);
    const chapterTitles = [
      ...new Set(sectionChunks.map((chunk) => chunk.metadata.chapter_title)),
    ];

    console.log(section);
    console.log(`total chunks: ${sectionChunks.length}`);
    console.log(`total characters: ${charCounts.reduce((total, value) => total + value, 0)}`);
    console.log(`average chunk size: ${average(charCounts)}`);
    console.log('content type distribution:');
    printDistribution(contentTypeDistribution(sectionChunks));
    console.log('chapter titles:');
    for (const title of chapterTitles) {
      console.log(`- ${title}`);
    }
    console.log('');
  }
};

const printChapterSummary = (chunks) => {
  const byChapter = groupBy(
    chunks,
    (chunk) => `${chunk.metadata.section}-${chunk.metadata.chapter_no}`
  );

  separator();
  console.log('CHAPTER-WISE SUMMARY');
  separator();

  for (const key of Object.keys(byChapter).sort()) {
    const chapterChunks = byChapter[key];
    const first = chapterChunks[0];
    const charCounts = chapterChunks.map((chunk) => chunk.metadata.char_count);
    const headingCountUsed = new Set(chapterChunks.map((chunk) => chunk.metadata.heading_path)).size;

    console.log(`${first.metadata.section} chapter ${first.metadata.chapter_no}`);
    console.log(`section: ${first.metadata.section}`);
    console.log(`chapter_no: ${first.metadata.chapter_no}`);
    console.log(`original_science_chapter_no: ${first.metadata.original_science_chapter_no}`);
    console.log(`chapter_title: ${first.metadata.chapter_title}`);
    console.log(`chunk count: ${chapterChunks.length}`);
    console.log(`average chunk size: ${average(charCounts)}`);
    console.log(`smallest chunk size: ${Math.min(...charCounts)}`);
    console.log(`largest chunk size: ${Math.max(...charCounts)}`);
    console.log(`heading count used: ${headingCountUsed}`);
    console.log('');
  }
};

const printContentTypeSummary = (chunks) => {
  separator();
  console.log('CONTENT TYPE DISTRIBUTION');
  separator();
  printDistribution(contentTypeDistribution(chunks));
  console.log('');
};

const printMetadataValidationSummary = (validationResults) => {
  separator();
  console.log('METADATA VALIDATION SUMMARY');
  separator();

  for (const { chunk, validation } of validationResults) {
    console.log(`${chunk.id}: ${validation.valid ? 'VALID' : 'INVALID'}`);

    if (!validation.valid) {
      for (const error of validation.errors) {
        console.log(`- ${error}`);
      }
    }
  }

  console.log('');
};

const printSampleChunk = (label, chunk) => {
  if (!chunk) {
    return;
  }

  console.log(label);
  console.log(`id: ${chunk.id}`);
  console.log('metadata:');
  console.log(JSON.stringify(chunk.metadata, null, 2));
  console.log('first 800 chars of pageContent:');
  console.log(chunk.pageContent.slice(0, 800));
  console.log('');
};

const printSampleChunks = (chunks) => {
  const bySection = groupBy(chunks, (chunk) => chunk.metadata.section);
  const largest = [...chunks].sort((left, right) => right.metadata.char_count - left.metadata.char_count)[0];
  const smallest = [...chunks].sort((left, right) => left.metadata.char_count - right.metadata.char_count)[0];
  const formulaOrExampleOrQuestion = chunks.find((chunk) =>
    ['formula', 'example', 'question', 'mixed'].includes(chunk.metadata.content_type)
  );

  separator();
  console.log('SAMPLE CHUNKS');
  separator();

  for (const section of sectionOrder) {
    printSampleChunk(`first chunk of ${section}`, bySection[section]?.[0]);
  }

  printSampleChunk('largest chunk', largest);
  printSampleChunk('smallest chunk', smallest);
  printSampleChunk('formula/example/question chunk', formulaOrExampleOrQuestion);
};

const documents = await loadMarkdownDocuments(baseDataDir);
const chunks = await createMarkdownChunks(documents);
const validationResults = chunks.map((chunk) => ({
  chunk,
  validation: validateChunk(chunk),
}));

printOverallSummary(documents, chunks);
printSectionSummary(chunks);
printChapterSummary(chunks);
printContentTypeSummary(chunks);
printMetadataValidationSummary(validationResults);
printSampleChunks(chunks);

const validCount = validationResults.filter((result) => result.validation.valid).length;
const invalidCount = validationResults.length - validCount;
const duplicateIds = getDuplicateIdCount(chunks);
const emptyChunks = chunks.filter((chunk) => chunk.pageContent.trim().length === 0).length;
const chunksUnder300 = chunks.filter((chunk) => chunk.metadata.char_count < 300).length;
const chunksOver1800 = chunks.filter((chunk) => chunk.metadata.char_count > 1800).length;
const chunksOver2500 = chunks.filter((chunk) => chunk.metadata.char_count > 2500).length;
const status =
  invalidCount === 0 && duplicateIds === 0 && emptyChunks === 0 && chunksOver2500 === 0
    ? 'READY_FOR_EMBEDDINGS'
    : 'NOT_READY_FOR_EMBEDDINGS';

console.log('CHUNKING INSPECTION REPORT');
console.log(`Documents loaded: ${documents.length}`);
console.log(`Total chunks: ${chunks.length}`);
console.log(`Valid chunks: ${validCount}`);
console.log(`Invalid chunks: ${invalidCount}`);
console.log(`Duplicate chunk ids: ${duplicateIds}`);
console.log(`Empty chunks: ${emptyChunks}`);
console.log(`Chunks under 300 chars: ${chunksUnder300}`);
console.log(`Chunks over 1800 chars: ${chunksOver1800}`);
console.log(`Chunks over 2500 chars: ${chunksOver2500}`);
console.log(`Status: ${status}`);

