import fs from 'node:fs/promises';
import path from 'node:path';

import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';

import { retrieverConfig } from './retriever.config.js';

const VECTOR_STORE_TYPE = 'LangChain MemoryVectorStore';
const vectorStoreCache = new Map();

const validateMemoryVectors = (memoryVectors) => {
  if (!Array.isArray(memoryVectors) || memoryVectors.length === 0) {
    throw new Error('Vector store is empty or missing memoryVectors.');
  }

  const embeddingDimension = memoryVectors[0]?.embedding?.length;

  if (!Number.isInteger(embeddingDimension) || embeddingDimension <= 0) {
    throw new Error('Vector store first embedding is invalid.');
  }

  if (embeddingDimension !== retrieverConfig.expectedEmbeddingDimension) {
    throw new Error(
      `Vector store embedding dimension mismatch. Expected ${retrieverConfig.expectedEmbeddingDimension}, received ${embeddingDimension}.`
    );
  }

  for (const [index, vector] of memoryVectors.entries()) {
    if (typeof vector?.content !== 'string' || !vector.content.trim()) {
      throw new Error(`memoryVectors[${index}] is missing string content.`);
    }

    if (!Array.isArray(vector.embedding) || vector.embedding.length === 0) {
      throw new Error(`memoryVectors[${index}] is missing embedding values.`);
    }

    if (vector.embedding.length !== embeddingDimension) {
      throw new Error(
        `memoryVectors[${index}] has dimension ${vector.embedding.length}; expected ${embeddingDimension}.`
      );
    }

    if (!vector.embedding.every((value) => Number.isFinite(value))) {
      throw new Error(`memoryVectors[${index}] contains non-numeric embedding values.`);
    }

    if (!vector.metadata || typeof vector.metadata !== 'object') {
      throw new Error(`memoryVectors[${index}] is missing metadata.`);
    }
  }

  return embeddingDimension;
};

const loadVectorStorePayload = async (filePath) => {
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

  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Vector store JSON is invalid at ${absoluteFilePath}: ${error.message}`);
  }
};

export const loadLangChainMemoryVectorStore = async (filePath, embeddings) => {
  const absoluteFilePath = path.resolve(filePath);

  if (vectorStoreCache.has(absoluteFilePath)) {
    return vectorStoreCache.get(absoluteFilePath);
  }

  const loadPromise = (async () => {
    const payload = await loadVectorStorePayload(absoluteFilePath);

    if (payload.vectorStoreType !== VECTOR_STORE_TYPE) {
      throw new Error(
        `Unsupported vector store type "${payload.vectorStoreType}". Expected "${VECTOR_STORE_TYPE}".`
      );
    }

    const embeddingDimension = validateMemoryVectors(payload.memoryVectors);
    const vectorStore = new MemoryVectorStore(embeddings);

    // Hydrate LangChain's local store from the saved vectors. This does not
    // re-embed content; query embedding happens later during similarity search.
    vectorStore.memoryVectors = payload.memoryVectors;

    return {
      vectorStore,
      metadata: payload,
      totalVectors: payload.memoryVectors.length,
      embeddingDimension,
    };
  })();

  vectorStoreCache.set(absoluteFilePath, loadPromise);

  try {
    return await loadPromise;
  } catch (error) {
    vectorStoreCache.delete(absoluteFilePath);
    throw error;
  }
};
