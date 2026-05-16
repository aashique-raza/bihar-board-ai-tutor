import { TaskType } from '@google/generative-ai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_PROVIDER = 'google-generative-ai-langchain';
const MAX_BATCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

const wait = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const isRetryableEmbeddingError = (error) => {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes('[429 Too Many Requests]') ||
    message.includes('fetch failed') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT')
  );
};

class SequentialGoogleGenerativeAIEmbeddings extends GoogleGenerativeAIEmbeddings {
  async embedQuery(document) {
    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
      try {
        return await super.embedQuery(document);
      } catch (error) {
        if (!isRetryableEmbeddingError(error) || attempt === MAX_BATCH_ATTEMPTS) {
          throw error;
        }

        await wait(RETRY_DELAY_MS * attempt);
      }
    }

    throw new Error('LangChain Google query embedding failed after retry attempts.');
  }

  async embedOneDocument(document, documentNumber) {
    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
      const embedding = await this.embedQuery(document);

      if (Array.isArray(embedding) && embedding.length > 0) {
        return embedding;
      }

      if (attempt < MAX_BATCH_ATTEMPTS) {
        await wait(RETRY_DELAY_MS * attempt);
      }
    }

    throw new Error(
      `LangChain Google embeddings returned an empty vector for document ${documentNumber}.`
    );
  }

  async embedDocuments(documents) {
    const embeddings = [];

    // The package batch endpoint can return empty vectors for some valid chunks.
    // Use LangChain's single-content embedding path while preserving the
    // Embeddings interface consumed by MemoryVectorStore.fromDocuments(...).
    for (const [index, document] of documents.entries()) {
      embeddings.push(await this.embedOneDocument(document, index + 1));
    }

    return embeddings;
  }
}

const getGoogleApiKey = () => {
  const isUsableApiKey = (value) =>
    typeof value === 'string' &&
    value.trim().length > 10 &&
    !value.includes('your_') &&
    value !== '...';

  const googleApiKey = isUsableApiKey(process.env.GOOGLE_API_KEY)
    ? process.env.GOOGLE_API_KEY
    : undefined;
  const geminiApiKey = isUsableApiKey(process.env.GEMINI_API_KEY)
    ? process.env.GEMINI_API_KEY
    : undefined;
  const apiKey = googleApiKey || geminiApiKey;

  if (!apiKey) {
    throw new Error(
      'GOOGLE_API_KEY is missing. GEMINI_API_KEY is also supported as a fallback for this project.'
    );
  }

  if (!googleApiKey && geminiApiKey) {
    process.env.GOOGLE_API_KEY = geminiApiKey;
  }

  return apiKey;
};

const createEmbeddings = (taskType) => {
  const embeddings = new SequentialGoogleGenerativeAIEmbeddings({
    apiKey: getGoogleApiKey(),
    modelName: GEMINI_EMBEDDING_MODEL,
    taskType,
    maxConcurrency: 1,
    maxRetries: 0,
  });

  return embeddings;
};

export const createDocumentEmbeddings = () =>
  createEmbeddings(TaskType.RETRIEVAL_DOCUMENT);

export const createQueryEmbeddings = () =>
  createEmbeddings(TaskType.RETRIEVAL_QUERY);
