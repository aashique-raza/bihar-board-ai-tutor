import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { loadMarkdownDocuments } from '../loaders/markdownLoader.js';
import {
  ALLOWED_CONTENT_TYPES,
  createMarkdownChunks,
  createMarkdownChunksLazy,
  validateChunk,
} from './markdownChunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');
const sectionOrder = ['Chemistry', 'Biology', 'Physics'];

const REQUIRED_INHERITED_METADATA = [
  'board',
  'class',
  'subject',
  'section',
  'chapter_no',
  'original_science_chapter_no',
  'chapter_title',
  'source_path',
  'file_name',
];

const REQUIRED_CHUNK_METADATA = [
  'chunk_index',
  'chunk_id',
  'heading_path',
  'heading_level',
  'content_type',
  'char_count',
  'word_count',
  'line_count',
];

const EXPECTED_CHAPTERS = {
  Chemistry: [1, 2, 3, 4, 5],
  Biology: [1, 2, 3, 4],
  Physics: [1, 2, 3, 4, 5, 6, 7],
};

const results = [];
let documents = [];
let chunks = [];
let lazyChunks = [];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runTest = async (name, testFn) => {
  try {
    await testFn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    console.log(`FAIL ${name}`);
    console.log(`  ${error.message}`);
  }
};

const getContentPart = (chunk) => chunk.pageContent.split('[Content]')[1]?.trim() || '';

const isHeadingOnly = (chunk) => {
  const contentPart = getContentPart(chunk);
  const lines = contentPart
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 && lines.every((line) => /^#{1,6}\s+\S+/.test(line));
};

const groupBy = (items, getKey) =>
  items.reduce((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});

const getSortedIds = (items) => items.map((item) => item.id).sort();

const arraysEqual = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const printContentTypeDistribution = () => {
  const distribution = Object.fromEntries(ALLOWED_CONTENT_TYPES.map((type) => [type, 0]));

  for (const chunk of chunks) {
    distribution[chunk.metadata.content_type] += 1;
  }

  console.log('Content type distribution:');
  for (const type of ALLOWED_CONTENT_TYPES) {
    console.log(`- ${type}: ${distribution[type]}`);
  }
};

const printSampleChunks = () => {
  console.log('Sample chunks:');

  for (const section of sectionOrder) {
    const sectionChunks = chunks.filter((chunk) => chunk.metadata.section === section).slice(0, 2);

    for (const chunk of sectionChunks) {
      console.log('---');
      console.log(`id: ${chunk.id}`);
      console.log(`section: ${chunk.metadata.section}`);
      console.log(`chapter_title: ${chunk.metadata.chapter_title}`);
      console.log(`heading_path: ${chunk.metadata.heading_path}`);
      console.log(`content_type: ${chunk.metadata.content_type}`);
      console.log(`char_count: ${chunk.metadata.char_count}`);
      console.log('first 500 chars of pageContent:');
      console.log(chunk.pageContent.slice(0, 500));
    }
  }
};

await runTest('Test 1: Base data directory exists.', async () => {
  assert(fs.existsSync(baseDataDir), `Missing base data directory: ${baseDataDir}`);
});

await runTest('Test 2: @langchain/textsplitters package/import is available.', async () => {
  assert(
    typeof RecursiveCharacterTextSplitter === 'function',
    'RecursiveCharacterTextSplitter import is not a function.'
  );
});

await runTest('Test 3: Loader returns exactly 16 documents.', async () => {
  documents = await loadMarkdownDocuments(baseDataDir);
  assert(documents.length === 16, `Expected 16 documents, received ${documents.length}.`);
});

await runTest('Test 4: Chunker returns non-empty chunk array.', async () => {
  chunks = await createMarkdownChunks(documents);
  assert(chunks.length > 0, 'Chunker returned no chunks.');
});

await runTest('Test 5: Total chunk count is reasonable.', async () => {
  if (chunks.length < 480 || chunks.length > 700) {
    console.log(`  WARNING ideal chunk count is 480-700; received ${chunks.length}.`);
  }

  assert(
    chunks.length >= 350 && chunks.length <= 1000,
    `Expected 350-1000 chunks, received ${chunks.length}.`
  );
});

await runTest('Test 6: Every chunk is LangChain-compatible.', async () => {
  assert(
    chunks.every((chunk) => 'pageContent' in chunk && 'metadata' in chunk),
    'At least one chunk is missing pageContent or metadata.'
  );
});

await runTest('Test 7: Every chunk has unique id.', async () => {
  assert(new Set(chunks.map((chunk) => chunk.id)).size === chunks.length, 'Duplicate chunk ids found.');
});

await runTest('Test 8: Every chunk metadata.chunk_id equals chunk.id.', async () => {
  assert(
    chunks.every((chunk) => chunk.metadata.chunk_id === chunk.id),
    'At least one metadata.chunk_id does not match chunk.id.'
  );
});

await runTest('Test 9: Every chunk has required inherited metadata.', async () => {
  for (const chunk of chunks) {
    for (const field of REQUIRED_INHERITED_METADATA) {
      assert(chunk.metadata[field] !== undefined && chunk.metadata[field] !== '', `${chunk.id} missing ${field}.`);
    }
  }
});

await runTest('Test 10: Every chunk has chunk-specific metadata.', async () => {
  for (const chunk of chunks) {
    for (const field of REQUIRED_CHUNK_METADATA) {
      assert(chunk.metadata[field] !== undefined && chunk.metadata[field] !== '', `${chunk.id} missing ${field}.`);
    }
  }
});

await runTest('Test 11: Every chunk pageContent includes [Context].', async () => {
  assert(chunks.every((chunk) => chunk.pageContent.includes('[Context]')), 'A chunk is missing [Context].');
});

await runTest('Test 12: Every chunk pageContent includes [Content].', async () => {
  assert(chunks.every((chunk) => chunk.pageContent.includes('[Content]')), 'A chunk is missing [Content].');
});

await runTest('Test 13: No chunk pageContent starts with YAML frontmatter marker "---".', async () => {
  assert(
    chunks.every((chunk) => !chunk.pageContent.trimStart().startsWith('---')),
    'At least one chunk starts with YAML frontmatter marker.'
  );
});

await runTest('Test 14: No chunk has empty pageContent.', async () => {
  assert(chunks.every((chunk) => chunk.pageContent.trim().length > 0), 'At least one chunk is empty.');
});

await runTest('Test 15: No chunk is only context header.', async () => {
  assert(
    chunks.every((chunk) => getContentPart(chunk).length > 0),
    'At least one chunk only contains the context header.'
  );
});

await runTest('Test 16: No chunk is only a markdown heading.', async () => {
  assert(!chunks.some(isHeadingOnly), 'At least one chunk contains only markdown headings.');
});

await runTest('Test 17: No chunk is below 150 characters unless explicitly marked as unavoidable.', async () => {
  const tinyChunks = chunks.filter((chunk) => chunk.metadata.char_count < 150);

  if (tinyChunks.length > 0) {
    console.log('Chunks below 150 chars:');
    for (const chunk of tinyChunks) {
      console.log(`- ${chunk.id}: ${chunk.metadata.char_count}`);
    }
  }

  assert(tinyChunks.length === 0, `${tinyChunks.length} chunks are below 150 characters.`);
});

await runTest('Test 18: No chunk exceeds 2500 characters.', async () => {
  const hugeChunks = chunks.filter((chunk) => chunk.metadata.char_count > 2500);
  assert(hugeChunks.length === 0, `${hugeChunks.length} chunks exceed 2500 characters.`);
});

await runTest('Test 19: Section-wise chunk counts exist.', async () => {
  const bySection = groupBy(chunks, (chunk) => chunk.metadata.section);

  for (const section of sectionOrder) {
    assert((bySection[section]?.length || 0) > 0, `${section} has no chunks.`);
  }
});

await runTest('Test 20: Chapter-wise chunk counts exist for all 16 chapters.', async () => {
  const keys = new Set(
    chunks.map((chunk) => `${chunk.metadata.section}-${chunk.metadata.chapter_no}`)
  );

  assert(keys.size === 16, `Expected 16 section/chapter groups, received ${keys.size}.`);
});

await runTest('Test 21: Chunks preserve correct subject distribution.', async () => {
  for (const [section, expectedChapters] of Object.entries(EXPECTED_CHAPTERS)) {
    const actualChapters = [
      ...new Set(
        chunks
          .filter((chunk) => chunk.metadata.section === section)
          .map((chunk) => chunk.metadata.chapter_no)
      ),
    ].sort((left, right) => left - right);

    assert(
      arraysEqual(actualChapters, expectedChapters),
      `${section} chapter distribution is incorrect.`
    );
  }
});

await runTest('Test 22: Content type distribution is calculated and printed.', async () => {
  printContentTypeDistribution();
});

await runTest('Test 23: At least 80% chunks have non-empty heading_path.', async () => {
  const withHeadingPath = chunks.filter((chunk) => chunk.metadata.heading_path).length;
  const percent = (withHeadingPath / chunks.length) * 100;
  assert(percent >= 80, `Only ${percent.toFixed(2)}% chunks have heading_path.`);
});

await runTest('Test 24: Normal chunking and lazy chunking return same total chunk count.', async () => {
  lazyChunks = [];

  for await (const chunk of createMarkdownChunksLazy(baseDataDir)) {
    lazyChunks.push(chunk);
  }

  assert(
    lazyChunks.length === chunks.length,
    `Normal chunks ${chunks.length}, lazy chunks ${lazyChunks.length}.`
  );
});

await runTest('Test 25: Normal chunking and lazy chunking return same chunk ids.', async () => {
  assert(
    arraysEqual(getSortedIds(chunks), getSortedIds(lazyChunks)),
    'Normal and lazy chunk ids differ.'
  );
});

await runTest('Test 26: Print random sample chunks.', async () => {
  printSampleChunks();
});

await runTest('Test 27: Calculate chunking success percentage.', async () => {
  const passedBeforeThisTest = results.filter((result) => result.passed).length;
  const totalAfterThisTest = 27;
  const successPercent = ((passedBeforeThisTest + 1) / totalAfterThisTest) * 100;

  assert(Number.isFinite(successPercent), 'Success percentage could not be calculated.');
});

const invalidChunks = chunks
  .map((chunk) => ({ chunk, validation: validateChunk(chunk) }))
  .filter((result) => !result.validation.valid);

if (invalidChunks.length > 0) {
  console.log('Invalid chunk details:');
  for (const { chunk, validation } of invalidChunks) {
    console.log(`- ${chunk.id}`);
    for (const error of validation.errors) {
      console.log(`  ${error}`);
    }
  }
}

const totalTests = results.length;
const passedTests = results.filter((result) => result.passed).length;
const failedTests = totalTests - passedTests;
const successPercent = Math.round((passedTests / totalTests) * 100);
const chunkerStatus = failedTests === 0 ? 'READY' : 'NOT READY';

console.log('');
console.log('CHUNKER TEST REPORT');
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`Success: ${successPercent}%`);
console.log('');
console.log(`Chunker status: ${chunkerStatus}`);

if (failedTests > 0) {
  console.log('');
  console.log('Failed tests:');
  for (const result of results.filter((testResult) => !testResult.passed)) {
    console.log(`- ${result.name}: ${result.error}`);
  }

  process.exitCode = 1;
}

