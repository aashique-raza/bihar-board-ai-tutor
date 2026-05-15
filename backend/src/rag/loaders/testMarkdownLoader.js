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
} from './markdownLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..', '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');

const EXPECTED_COUNTS = {
  Chemistry: 5,
  Biology: 4,
  Physics: 7,
};

const EXPECTED_CHAPTERS = {
  Chemistry: [1, 2, 3, 4, 5],
  Biology: [1, 2, 3, 4],
  Physics: [1, 2, 3, 4, 5, 6, 7],
};

const EXPECTED_ORIGINAL_CHAPTERS = {
  Chemistry: [1, 2, 3, 4, 5],
  Biology: [6, 7, 8, 9],
  Physics: [10, 11, 12, 13, 14, 15, 16],
};

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
  'source_path',
  'file_name',
];

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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const collectLazyDocuments = async () => {
  const docs = [];

  for await (const doc of loadMarkdownDocumentsLazy(baseDataDir)) {
    docs.push(doc);
  }

  return docs;
};

const getCountsBySection = (docs) =>
  docs.reduce((counts, doc) => {
    counts[doc.metadata.section] = (counts[doc.metadata.section] || 0) + 1;
    return counts;
  }, {});

const sortedIds = (docs) => docs.map((doc) => doc.id).sort();

const getSortedValuesBySection = (docs, field, section) =>
  docs
    .filter((doc) => doc.metadata.section === section)
    .map((doc) => doc.metadata[field])
    .sort((left, right) => left - right);

const arraysEqual = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sectionMatchesFolder = (doc) => {
  const sourcePath = doc.metadata.source_path;
  const folder = sourcePath.split('/').at(-2);

  return folder?.toLowerCase() === doc.metadata.section.toLowerCase();
};

const printDocumentTable = (normalDocs, lazyDocs) => {
  const rows = [
    ...normalDocs.map((doc) => ({ ...doc.metadata, load_mode: 'normal' })),
    ...lazyDocs.map((doc) => ({ ...doc.metadata, load_mode: 'lazy' })),
  ].sort((left, right) => {
    const sectionOrder = { Chemistry: 1, Biology: 2, Physics: 3 };
    return (
      sectionOrder[left.section] - sectionOrder[right.section] ||
      left.chapter_no - right.chapter_no ||
      left.load_mode.localeCompare(right.load_mode)
    );
  });

  console.log('');
  console.log(
    'section | chapter_no | original_science_chapter_no | chapter_title | file_name | load_mode'
  );
  console.log(
    '--- | --- | --- | --- | --- | ---'
  );

  for (const row of rows) {
    console.log(
      `${row.section} | ${row.chapter_no} | ${row.original_science_chapter_no} | ${row.chapter_title} | ${row.file_name} | ${row.load_mode}`
    );
  }
};

let normalDocs = [];
let lazyDocs = [];

await runTest('Test 1: Base data directory exists.', async () => {
  assert(fs.existsSync(baseDataDir), `Missing base data directory: ${baseDataDir}`);
});

await runTest('Test 2: LangChain package is available.', async () => {
  await import('@langchain/classic');
});

await runTest('Test 3: DirectoryLoader and TextLoader imports work.', async () => {
  assert(typeof DirectoryLoader === 'function', 'DirectoryLoader import is not a function.');
  assert(typeof TextLoader === 'function', 'TextLoader import is not a function.');
});

await runTest('Test 4: Normal load returns exactly 16 documents.', async () => {
  normalDocs = await loadMarkdownDocuments(baseDataDir);
  assert(normalDocs.length === 16, `Expected 16 documents, received ${normalDocs.length}.`);
});

await runTest('Test 5: Lazy loader returns exactly 16 documents.', async () => {
  lazyDocs = await collectLazyDocuments();
  assert(lazyDocs.length === 16, `Expected 16 documents, received ${lazyDocs.length}.`);
});

await runTest('Test 6: Normal loader and lazy loader return the same document ids.', async () => {
  assert(
    arraysEqual(sortedIds(normalDocs), sortedIds(lazyDocs)),
    'Normal and lazy loader document ids differ.'
  );
});

await runTest('Test 7: Only markdown chapter files are loaded.', async () => {
  assert(
    normalDocs.every((doc) => /^chapter-\d{2}-.+\.md$/i.test(doc.metadata.file_name)),
    'A loaded file is not a markdown chapter file.'
  );
});

await runTest('Test 8: README.md is ignored.', async () => {
  assert(
    normalDocs.every((doc) => doc.metadata.file_name.toLowerCase() !== 'readme.md'),
    'README.md was loaded.'
  );
});

await runTest('Test 9: Subject-wise counts are correct.', async () => {
  const counts = getCountsBySection(normalDocs);

  for (const [section, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
    assert(
      counts[section] === expectedCount,
      `${section} expected ${expectedCount}, received ${counts[section] || 0}.`
    );
  }
});

await runTest('Test 10: Every document has required metadata.', async () => {
  for (const doc of normalDocs) {
    for (const field of REQUIRED_METADATA_FIELDS) {
      assert(
        doc.metadata[field] !== undefined && doc.metadata[field] !== null && doc.metadata[field] !== '',
        `${doc.metadata.file_name} missing metadata field: ${field}`
      );
    }
  }
});

await runTest('Test 11: Every document has non-empty pageContent.', async () => {
  assert(
    normalDocs.every((doc) => doc.pageContent.trim().length > 0),
    'At least one document has empty pageContent.'
  );
});

await runTest('Test 12: Every document section matches its folder.', async () => {
  assert(
    normalDocs.every(sectionMatchesFolder),
    'At least one document section does not match its folder.'
  );
});

await runTest('Test 13: Every document has unique id.', async () => {
  const ids = normalDocs.map((doc) => doc.id);
  const uniqueIds = new Set(ids);

  assert(uniqueIds.size === ids.length, 'Duplicate document ids found.');
});

await runTest('Test 14: Every document has source_path and file_name.', async () => {
  assert(
    normalDocs.every((doc) => doc.metadata.source_path && doc.metadata.file_name),
    'At least one document is missing source_path or file_name.'
  );
});

await runTest('Test 15: Chapter numbers are sequential per section.', async () => {
  for (const [section, expectedChapters] of Object.entries(EXPECTED_CHAPTERS)) {
    assert(
      arraysEqual(getSortedValuesBySection(normalDocs, 'chapter_no', section), expectedChapters),
      `${section} chapter_no sequence is incorrect.`
    );
  }
});

await runTest('Test 16: Original science chapter numbers are correct.', async () => {
  for (const [section, expectedChapters] of Object.entries(EXPECTED_ORIGINAL_CHAPTERS)) {
    assert(
      arraysEqual(
        getSortedValuesBySection(normalDocs, 'original_science_chapter_no', section),
        expectedChapters
      ),
      `${section} original_science_chapter_no sequence is incorrect.`
    );
  }
});

await runTest('Test 17: No document pageContent should start with YAML frontmatter marker "---".', async () => {
  assert(
    normalDocs.every((doc) => !doc.pageContent.trimStart().startsWith('---')),
    'At least one document still starts with YAML frontmatter marker.'
  );
});

await runTest('Test 18: Every loaded document should be LangChain-compatible.', async () => {
  assert(
    normalDocs.every((doc) => 'pageContent' in doc && 'metadata' in doc),
    'At least one document is missing pageContent or metadata.'
  );
});

await runTest('Test 19: Print a clean table showing loaded documents.', async () => {
  printDocumentTable(normalDocs, lazyDocs);
});

await runTest('Test 20: Calculate loader success percentage.', async () => {
  const passedBeforeThisTest = results.filter((result) => result.passed).length;
  const totalAfterThisTest = 20;
  const successPercent = ((passedBeforeThisTest + 1) / totalAfterThisTest) * 100;

  assert(Number.isFinite(successPercent), 'Success percentage could not be calculated.');
});

for (const doc of normalDocs) {
  const validation = validateMarkdownDocument(doc);

  if (!validation.valid) {
    console.log(`Validation detail for ${doc.metadata.source_path}:`);
    console.log(validation.errors.join('\n'));
  }
}

const totalTests = results.length;
const passedTests = results.filter((result) => result.passed).length;
const failedTests = totalTests - passedTests;
const successPercent = Math.round((passedTests / totalTests) * 100);
const loaderStatus = failedTests === 0 ? 'READY' : 'NOT READY';
const lazyMode = hasNativeLangChainLazyLoad(baseDataDir)
  ? 'native LangChain lazyLoad'
  : 'custom async generator fallback';

console.log('');
console.log(`Lazy loading mode: ${lazyMode}`);
console.log('');
console.log('LOADER TEST REPORT');
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log(`Success: ${successPercent}%`);
console.log('');
console.log(`Loader status: ${loaderStatus}`);

if (failedTests > 0) {
  console.log('');
  console.log('Failed tests:');
  for (const result of results.filter((testResult) => !testResult.passed)) {
    console.log(`- ${result.name}: ${result.error}`);
  }

  process.exitCode = 1;
}
