import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const vectorStorePath = path.resolve(backendRoot, 'storage', 'vector-store.json');

const preview = (text, maxLength = 240) => {
  const singleLine = String(text || '').replace(/\s+/g, ' ').trim();
  return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength - 3)}...`;
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async () => {
  const rawJson = await fs.readFile(vectorStorePath, 'utf8');
  const payload = JSON.parse(rawJson);

  assert(payload.provider, 'provider is missing.');
  assert(payload.embeddingModel, 'embeddingModel is missing.');
  assert(
    payload.vectorStoreType === 'LangChain MemoryVectorStore',
    `vectorStoreType must be "LangChain MemoryVectorStore"; received "${payload.vectorStoreType}".`
  );
  assert(Number.isInteger(payload.totalVectors), 'totalVectors must be an integer.');
  assert(Array.isArray(payload.memoryVectors), 'memoryVectors must be an array.');
  assert(
    payload.memoryVectors.length === payload.totalVectors,
    'memoryVectors.length must equal totalVectors.'
  );

  const firstVector = payload.memoryVectors[0];
  assert(firstVector, 'memoryVectors must contain at least one vector.');
  const embeddingDimension = firstVector.embedding?.length;

  for (const [index, vector] of payload.memoryVectors.entries()) {
    assert(typeof vector.content === 'string' && vector.content.length > 0, `Vector ${index} content is invalid.`);
    assert(Array.isArray(vector.embedding), `Vector ${index} embedding is not an array.`);
    assert(vector.embedding.length === embeddingDimension, `Vector ${index} embedding dimension differs.`);
    assert(vector.embedding.every((value) => Number.isFinite(value)), `Vector ${index} embedding has non-finite values.`);
    assert(vector.metadata && typeof vector.metadata === 'object', `Vector ${index} metadata is invalid.`);
    assert(vector.metadata.chunk_id, `Vector ${index} metadata.chunk_id is missing.`);
    assert(vector.metadata.originalText, `Vector ${index} metadata.originalText is missing.`);
  }

  console.log('Vector store validation passed');
  console.log(`totalVectors: ${payload.totalVectors}`);
  console.log(`embeddingDimension: ${embeddingDimension}`);
  console.log(`firstVectorMetadataKeys: ${Object.keys(firstVector.metadata).join(', ')}`);
  console.log(`firstVectorPreview: ${preview(firstVector.content)}`);
};

run().catch((error) => {
  console.error(`Vector store validation failed: ${error.message}`);
  process.exitCode = 1;
});
