/**
 * inspectMarkdownChunks.js
 *
 * Inspection script for the markdown chunker.
 * Run via: npm run inspect:chunks
 *
 * Prints detailed statistics about all chunks:
 * section-wise summary, content type distribution, sample chunks.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMarkdownDocuments } from '../rag/markdownLoader.js';
import {
  ALLOWED_CONTENT_TYPES,
  createMarkdownChunks,
  validateChunk,
} from '../rag/markdownChunker.js';

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
  if (numbers.length === 0) return 0;
  return Math.round(numbers.reduce((total, value) => total + value, 0) / numbers.length);
};

const contentTypeDistribution = (chunks) => {
  const distribution = Object.fromEntries(ALLOWED_CONTENT_TYPES.map((type) => [type, 0]));
  for (const chunk of chunks) distribution[chunk.metadata.content_type] += 1;
  return distribution;
};

const getDuplicateIdCount = (chunks) => {
  const ids = chunks.map((chunk) => chunk.id);
  return ids.length - new Set(ids).size;
};

const printOverallSummary = (documents, chunks) => {
  const charCounts = chunks.map((chunk) => chunk.metadata.char_count);
  const smallest = [...chunks].sort((a, b) => a.metadata.char_count - b.metadata.char_count)[0];
  const largest = [...chunks].sort((a, b) => b.metadata.char_count - a.metadata.char_count)[0];

  separator();
  console.log('OVERALL CHUNK SUMMARY');
  separator();
  console.log(`total documents: ${documents.length}`);
  console.log(`total chunks: ${chunks.length}`);
  console.log(`total characters: ${charCounts.reduce((total, value) => total + value, 0)}`);
  console.log(`average chunk size: ${average(charCounts)}`);
  console.log(`smallest chunk: ${smallest.id} (${smallest.metadata.char_count})`);
  console.log(`largest chunk: ${largest.id} (${largest.metadata.char_count})`);
  console.log(`chunks under 300 chars: ${chunks.filter((c) => c.metadata.char_count < 300).length}`);
  console.log(`chunks over 2500 chars: ${chunks.filter((c) => c.metadata.char_count > 2500).length}`);
  console.log(`duplicate ids: ${getDuplicateIdCount(chunks)}`);
  console.log('');
};

const printSectionSummary = (chunks) => {
  const bySection = groupBy(chunks, (chunk) => chunk.metadata.section);
  separator();
  console.log('SECTION-WISE SUMMARY');
  separator();
  for (const section of sectionOrder) {
    const sectionChunks = bySection[section] || [];
    console.log(`${section}: ${sectionChunks.length} chunks, avg size: ${average(sectionChunks.map((c) => c.metadata.char_count))}`);
  }
  console.log('');
  console.log('Content type distribution:');
  const dist = contentTypeDistribution(chunks);
  for (const type of ALLOWED_CONTENT_TYPES) console.log(`- ${type}: ${dist[type]}`);
  console.log('');
};

const printValidationSummary = (chunks) => {
  separator();
  console.log('VALIDATION SUMMARY');
  separator();
  const validationResults = chunks.map((chunk) => ({ chunk, validation: validateChunk(chunk) }));
  const invalid = validationResults.filter((r) => !r.validation.valid);
  if (invalid.length === 0) {
    console.log('All chunks are valid.');
  } else {
    for (const { chunk, validation } of invalid) {
      console.log(`INVALID: ${chunk.id}`);
      for (const error of validation.errors) console.log(`- ${error}`);
    }
  }
  console.log('');
  return validationResults;
};

const documents = await loadMarkdownDocuments(baseDataDir);
const chunks = await createMarkdownChunks(documents);
printOverallSummary(documents, chunks);
printSectionSummary(chunks);
const validationResults = printValidationSummary(chunks);
const validCount = validationResults.filter((r) => r.validation.valid).length;
const invalidCount = validationResults.length - validCount;
const status = invalidCount === 0 && getDuplicateIdCount(chunks) === 0 && chunks.filter((c) => c.metadata.char_count > 2500).length === 0
  ? 'READY_FOR_EMBEDDINGS'
  : 'NOT_READY_FOR_EMBEDDINGS';
console.log('CHUNKING INSPECTION REPORT');
console.log(`Total chunks: ${chunks.length}, Valid: ${validCount}, Invalid: ${invalidCount}`);
console.log(`Status: ${status}`);
