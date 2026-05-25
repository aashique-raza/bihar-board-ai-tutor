/**
 * testMarkdownLoader.js
 *
 * Test suite for the Markdown loader.
 * Run via: npm run test:loader
 *
 * Verifies: 16 documents loaded, correct section counts,
 * metadata validity, no YAML frontmatter leaking, unique IDs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DirectoryLoader } from '@langchain/classic/document_loaders/fs/directory';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';

import {
  hasNativeLangChainLazyLoad,
  loadMarkdownDocuments,
  loadMarkdownDocumentsLazy,
  validateMarkdownDocument,
} from '../rag/markdownLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');

const EXPECTED_COUNTS = { Chemistry: 5, Biology: 4, Physics: 7 };
const EXPECTED_CHAPTERS = { Chemistry: [1, 2, 3, 4, 5], Biology: [1, 2, 3, 4], Physics: [1, 2, 3, 4, 5, 6, 7] };
const EXPECTED_ORIGINAL_CHAPTERS = { Chemistry: [1, 2, 3, 4, 5], Biology: [6, 7, 8, 9], Physics: [10, 11, 12, 13, 14, 15, 16] };
const REQUIRED_METADATA_FIELDS = ['board', 'class', 'subject', 'section', 'chapter_no', 'original_science_chapter_no', 'chapter_title', 'language', 'source_type', 'source_path', 'file_name'];

const results = [];
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
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const arraysEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const getSortedValuesBySection = (docs, field, section) =>
  docs.filter((doc) => doc.metadata.section === section).map((doc) => doc.metadata[field]).sort((a, b) => a - b);

let normalDocs = [];
let lazyDocs = [];

await runTest('Test 1: Base data directory exists.', async () => {
  assert(fs.existsSync(baseDataDir), `Missing base data directory: ${baseDataDir}`);
});

await runTest('Test 2: LangChain package is available.', async () => {
  await import('@langchain/classic');
});

await runTest('Test 3: DirectoryLoader and TextLoader imports work.', async () => {
  assert(typeof DirectoryLoader === 'function', 'DirectoryLoader is not a function.');
  assert(typeof TextLoader === 'function', 'TextLoader is not a function.');
});

await runTest('Test 4: Normal load returns exactly 16 documents.', async () => {
  normalDocs = await loadMarkdownDocuments(baseDataDir);
  assert(normalDocs.length === 16, `Expected 16 documents, received ${normalDocs.length}.`);
});

await runTest('Test 5: Lazy loader returns exactly 16 documents.', async () => {
  lazyDocs = [];
  for await (const doc of loadMarkdownDocumentsLazy(baseDataDir)) lazyDocs.push(doc);
  assert(lazyDocs.length === 16, `Expected 16 documents, received ${lazyDocs.length}.`);
});

await runTest('Test 6: Normal and lazy loader return same document ids.', async () => {
  const normalIds = normalDocs.map((d) => d.id).sort();
  const lazyIds = lazyDocs.map((d) => d.id).sort();
  assert(arraysEqual(normalIds, lazyIds), 'Normal and lazy loader document ids differ.');
});

await runTest('Test 7: Subject-wise counts are correct.', async () => {
  const counts = normalDocs.reduce((acc, doc) => { acc[doc.metadata.section] = (acc[doc.metadata.section] || 0) + 1; return acc; }, {});
  for (const [section, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
    assert(counts[section] === expectedCount, `${section} expected ${expectedCount}, received ${counts[section] || 0}.`);
  }
});

await runTest('Test 8: Every document has required metadata.', async () => {
  for (const doc of normalDocs) {
    for (const field of REQUIRED_METADATA_FIELDS) {
      assert(doc.metadata[field] !== undefined && doc.metadata[field] !== null && doc.metadata[field] !== '', `${doc.metadata.file_name} missing: ${field}`);
    }
  }
});

await runTest('Test 9: Every document has non-empty pageContent.', async () => {
  assert(normalDocs.every((doc) => doc.pageContent.trim().length > 0), 'At least one document has empty pageContent.');
});

await runTest('Test 10: No document pageContent starts with YAML frontmatter marker.', async () => {
  assert(normalDocs.every((doc) => !doc.pageContent.trimStart().startsWith('---')), 'At least one document still has YAML frontmatter.');
});

await runTest('Test 11: Every document has unique id.', async () => {
  const ids = normalDocs.map((doc) => doc.id);
  assert(new Set(ids).size === ids.length, 'Duplicate document ids found.');
});

await runTest('Test 12: Chapter numbers are sequential per section.', async () => {
  for (const [section, expectedChapters] of Object.entries(EXPECTED_CHAPTERS)) {
    assert(arraysEqual(getSortedValuesBySection(normalDocs, 'chapter_no', section), expectedChapters), `${section} chapter_no sequence is incorrect.`);
  }
});

await runTest('Test 13: Original science chapter numbers are correct.', async () => {
  for (const [section, expectedChapters] of Object.entries(EXPECTED_ORIGINAL_CHAPTERS)) {
    assert(arraysEqual(getSortedValuesBySection(normalDocs, 'original_science_chapter_no', section), expectedChapters), `${section} original_science_chapter_no sequence is incorrect.`);
  }
});

await runTest('Test 14: Validate all documents with validateMarkdownDocument.', async () => {
  const validationResults = normalDocs.map((doc) => ({ doc, validation: validateMarkdownDocument(doc) }));
  const invalid = validationResults.filter((r) => !r.validation.valid);
  for (const { doc, validation } of invalid) {
    console.log(`  Invalid: ${doc.metadata.source_path}: ${validation.errors.join(', ')}`);
  }
  assert(invalid.length === 0, `${invalid.length} documents failed validation.`);
});

const lazyMode = hasNativeLangChainLazyLoad(baseDataDir) ? 'native LangChain lazyLoad' : 'custom async generator fallback';
const totalTests = results.length;
const passedTests = results.filter((r) => r.passed).length;
const failedTests = totalTests - passedTests;

console.log('');
console.log(`Lazy loading mode: ${lazyMode}`);
console.log('');
console.log('LOADER TEST REPORT');
console.log(`Total: ${totalTests}, Passed: ${passedTests}, Failed: ${failedTests}`);
console.log(`Loader status: ${failedTests === 0 ? 'READY' : 'NOT READY'}`);
if (failedTests > 0) {
  for (const result of results.filter((r) => !r.passed)) console.log(`- ${result.name}: ${result.error}`);
  process.exitCode = 1;
}
