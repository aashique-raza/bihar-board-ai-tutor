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

export const saveLangChainMemoryVectorStore = async (vectorStore, filePath, metadata = {}) => {
  const memoryVectors = vectorStore?.memoryVectors;
  validateMemoryVectors(memoryVectors);

  const absoluteFilePath = path.resolve(filePath);
  await fs.mkdir(path.dirname(absoluteFilePath), { recursive: true });

  // MemoryVectorStore is intentionally in-memory. This JSON adapter is a temporary
  // MVP persistence layer until the project moves to a real vector database.
  const payload = {
    ...metadata,
    vectorStoreType: VECTOR_STORE_TYPE,
    createdAt: new Date().toISOString(),
    totalVectors: memoryVectors.length,
    memoryVectors,
  };

  await fs.writeFile(absoluteFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

export const loadLangChainMemoryVectorStore = async (filePath, embeddings) => {
  const absoluteFilePath = path.resolve(filePath);
  let rawJson;

  try {
    rawJson = await fs.readFile(absoluteFilePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Vector store file not found at ${absoluteFilePath}. Run npm run rag:index first.`
      );
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

  return {
    vectorStore,
    metadata: payload,
  };
};
