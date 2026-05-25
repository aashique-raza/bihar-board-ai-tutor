/**
 * testMarkdownChunker.js
 *
 * Test suite for the markdown chunker.
 * Run via: npm run test:chunks
 *
 * Verifies: chunk count, metadata completeness, context headers,
 * no empty/heading-only chunks, content type detection, lazy/normal parity.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { loadMarkdownDocuments } from '../rag/markdownLoader.js';
import {
  ALLOWED_CONTENT_TYPES,
  createMarkdownChunks,
  createMarkdownChunksLazy,
  validateChunk,
} from '../rag/markdownChunker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');
const sectionOrder = ['Chemistry', 'Biology', 'Physics'];

const REQUIRED_INHERITED_METADATA = ['board', 'class', 'subject', 'section', 'chapter_no', 'original_science_chapter_no', 'chapter_title', 'source_path', 'file_name'];
const REQUIRED_CHUNK_METADATA = ['chunk_index', 'chunk_id', 'heading_path', 'heading_level', 'content_type', 'char_count', 'word_count', 'line_count'];
const EXPECTED_CHAPTERS = { Chemistry: [1, 2, 3, 4, 5], Biology: [1, 2, 3, 4], Physics: [1, 2, 3, 4, 5, 6, 7] };

const results = [];
let documents = [];
let chunks = [];
let lazyChunks = [];

const assert = (condition, message) => { if (!condition) throw new Error(message); };
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
const arraysEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const isHeadingOnly = (chunk) => {
  const contentPart = getContentPart(chunk);
  const lines = contentPart.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((line) => /^#{1,6}\s+\S+/.test(line));
};

await runTest('Test 1: Base data directory exists.', async () => {
  assert(fs.existsSync(baseDataDir), `Missing base data directory: ${baseDataDir}`);
});

await runTest('Test 2: @langchain/textsplitters package is available.', async () => {
  assert(typeof RecursiveCharacterTextSplitter === 'function', 'RecursiveCharacterTextSplitter import is not a function.');
});

await runTest('Test 3: Loader returns exactly 16 documents.', async () => {
  documents = await loadMarkdownDocuments(baseDataDir);
  assert(documents.length === 16, `Expected 16 documents, received ${documents.length}.`);
});

await runTest('Test 4: Chunker returns non-empty chunk array.', async () => {
  chunks = await createMarkdownChunks(documents);
  assert(chunks.length > 0, 'Chunker returned no chunks.');
});

await runTest('Test 5: Total chunk count is reasonable (350-1000).', async () => {
  if (chunks.length < 480 || chunks.length > 700) console.log(`  NOTE ideal chunk count is 480-700; received ${chunks.length}.`);
  assert(chunks.length >= 350 && chunks.length <= 1000, `Expected 350-1000 chunks, received ${chunks.length}.`);
});

await runTest('Test 6: Every chunk has unique id.', async () => {
  assert(new Set(chunks.map((c) => c.id)).size === chunks.length, 'Duplicate chunk ids found.');
});

await runTest('Test 7: Every chunk metadata.chunk_id equals chunk.id.', async () => {
  assert(chunks.every((c) => c.metadata.chunk_id === c.id), 'At least one metadata.chunk_id does not match chunk.id.');
});

await runTest('Test 8: Every chunk has required inherited metadata.', async () => {
  for (const chunk of chunks) {
    for (const field of REQUIRED_INHERITED_METADATA) {
      assert(chunk.metadata[field] !== undefined && chunk.metadata[field] !== '', `${chunk.id} missing ${field}.`);
    }
  }
});

await runTest('Test 9: Every chunk has chunk-specific metadata.', async () => {
  for (const chunk of chunks) {
    for (const field of REQUIRED_CHUNK_METADATA) {
      assert(chunk.metadata[field] !== undefined && chunk.metadata[field] !== '', `${chunk.id} missing ${field}.`);
    }
  }
});

await runTest('Test 10: Every chunk pageContent includes [Context] and [Content].', async () => {
  assert(chunks.every((c) => c.pageContent.includes('[Context]')), 'A chunk is missing [Context].');
  assert(chunks.every((c) => c.pageContent.includes('[Content]')), 'A chunk is missing [Content].');
});

await runTest('Test 11: No chunk starts with YAML frontmatter marker.', async () => {
  assert(chunks.every((c) => !c.pageContent.trimStart().startsWith('---')), 'At least one chunk starts with YAML frontmatter marker.');
});

await runTest('Test 12: No chunk has empty pageContent or is heading-only.', async () => {
  assert(chunks.every((c) => c.pageContent.trim().length > 0), 'At least one chunk is empty.');
  assert(!chunks.some(isHeadingOnly), 'At least one chunk contains only markdown headings.');
});

await runTest('Test 13: No chunk exceeds 2500 characters.', async () => {
  const huge = chunks.filter((c) => c.metadata.char_count > 2500);
  assert(huge.length === 0, `${huge.length} chunks exceed 2500 characters.`);
});

await runTest('Test 14: Chunks cover all 16 chapters.', async () => {
  const keys = new Set(chunks.map((c) => `${c.metadata.section}-${c.metadata.chapter_no}`));
  assert(keys.size === 16, `Expected 16 section/chapter groups, received ${keys.size}.`);
});

await runTest('Test 15: Normal and lazy chunking return same chunk count.', async () => {
  lazyChunks = [];
  for await (const chunk of createMarkdownChunksLazy(baseDataDir)) lazyChunks.push(chunk);
  assert(lazyChunks.length === chunks.length, `Normal chunks ${chunks.length}, lazy chunks ${lazyChunks.length}.`);
});

await runTest('Test 16: validateChunk passes for all chunks.', async () => {
  const invalid = chunks.map((c) => ({ chunk: c, validation: validateChunk(c) })).filter((r) => !r.validation.valid);
  for (const { chunk, validation } of invalid) {
    console.log(`  Invalid: ${chunk.id}: ${validation.errors.join(', ')}`);
  }
  assert(invalid.length === 0, `${invalid.length} chunks failed validateChunk.`);
});

await runTest('Test 17: Content type distribution printed.', async () => {
  const dist = Object.fromEntries(ALLOWED_CONTENT_TYPES.map((t) => [t, 0]));
  for (const chunk of chunks) dist[chunk.metadata.content_type] += 1;
  for (const type of ALLOWED_CONTENT_TYPES) console.log(`  - ${type}: ${dist[type]}`);
});

const totalTests = results.length;
const passedTests = results.filter((r) => r.passed).length;
const failedTests = totalTests - passedTests;

console.log('');
console.log('CHUNKER TEST REPORT');
console.log(`Total: ${totalTests}, Passed: ${passedTests}, Failed: ${failedTests}`);
console.log(`Chunker status: ${failedTests === 0 ? 'READY' : 'NOT READY'}`);
if (failedTests > 0) {
  for (const result of results.filter((r) => !r.passed)) console.log(`- ${result.name}: ${result.error}`);
  process.exitCode = 1;
}
