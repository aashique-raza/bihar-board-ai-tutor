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
 *   loadLangChainMemoryVectorStore(filePath, embeddings)
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
  const memoryVectors = vectorStore?.memoryVectors;
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

/**
 * Loads a previously saved vector store JSON file back into a MemoryVectorStore.
 * Used by the retriever at query time.
 *
 * @param {string} filePath   - Path to the saved JSON file
 * @param {object} embeddings - LangChain embeddings instance
 * @returns {{ vectorStore, metadata }}
 */
export const loadLangChainMemoryVectorStore = async (filePath, embeddings) => {
  const absoluteFilePath = path.resolve(filePath);
  let rawJson;

  try {
    rawJson = await fs.readFile(absoluteFilePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Vector store file not found at ${absoluteFilePath}. Run npm run rag:index first.`);
    }
    throw new Error(`Unable to read vector store file at ${absoluteFilePath}: ${error.message}`);
  }

  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Vector store JSON is corrupt at ${absoluteFilePath}: ${error.message}`);
  }

  if (payload.vectorStoreType !== VECTOR_STORE_TYPE) {
    throw new Error(
      `Unsupported vector store type "${payload.vectorStoreType}". Expected "${VECTOR_STORE_TYPE}".`
    );
  }

  validateMemoryVectors(payload.memoryVectors);

  const vectorStore = new MemoryVectorStore(embeddings);
  vectorStore.memoryVectors = payload.memoryVectors;

  return { vectorStore, metadata: payload };
};
