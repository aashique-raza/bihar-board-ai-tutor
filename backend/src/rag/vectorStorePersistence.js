/**
 * vectorStorePersistence.js
 *
 * Save and load a LangChain MemoryVectorStore to/from a JSON file on disk.
 *
 * WHY JSON INSTEAD OF A REAL VECTOR DB:
 *   This is an MVP-phase persistence layer. The vector store is held in memory
 *   at runtime and serialized to JSON during indexing. When the project grows,
 *   this can be swapped for a real vector database without changing the retriever.
 *
 * FUNCTIONS:
 *   saveLangChainMemoryVectorStore(vectorStore, filePath, metadata)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';

const VECTOR_STORE_TYPE = 'LangChain MemoryVectorStore';

const validateMemoryVectors = (memoryVectors) => {
  if (!Array.isArray(memoryVectors)) {
    throw new Error('Saved vector store is missing the memoryVectors array.');
  }

  for (const [index, vector] of memoryVectors.entries()) {
    if (typeof vector?.content !== 'string') {
      throw new Error(`memoryVectors[${index}] is missing string content.`);
    }
    if (!Array.isArray(vector?.embedding) || vector.embedding.length === 0) {
      throw new Error(`memoryVectors[${index}] is missing embedding values.`);
    }
    if (!vector.embedding.every((value) => Number.isFinite(value))) {
      throw new Error(`memoryVectors[${index}] contains non-numeric embedding values.`);
    }
    if (!vector.metadata || typeof vector.metadata !== 'object') {
      throw new Error(`memoryVectors[${index}] is missing metadata.`);
    }
  }
};

/**
 * Serializes the LangChain MemoryVectorStore to a JSON file.
 * Called at the end of the indexing pipeline (npm run rag:index).
 *
 * @param {MemoryVectorStore} vectorStore - The fully built vector store
 * @param {string} filePath              - Output file path
 * @param {object} metadata              - Extra metadata to include (provider, model, etc.)
 */
export const saveLangChainMemoryVectorStore = async (vectorStore, filePath, metadata = {}) => {
  // Depends on memoryVectors being a public array on @langchain/classic@1.0.32 MemoryVectorStore.
  // Package is pinned to exact version in package.json — do NOT add ^ caret.
  const memoryVectors = vectorStore?.memoryVectors;
  if (!Array.isArray(memoryVectors)) {
    throw new Error(
      '[vectorStorePersistence] MemoryVectorStore.memoryVectors is not a valid array. ' +
      '@langchain/classic may have changed its internal API. ' +
      'Package must stay pinned to 1.0.32 in package.json.'
    );
  }
  validateMemoryVectors(memoryVectors);

  const absoluteFilePath = path.resolve(filePath);
  await fs.mkdir(path.dirname(absoluteFilePath), { recursive: true });

  const payload = {
    ...metadata,
    vectorStoreType: VECTOR_STORE_TYPE,
    createdAt: new Date().toISOString(),
    totalVectors: memoryVectors.length,
    memoryVectors,
  };

  await fs.writeFile(absoluteFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

