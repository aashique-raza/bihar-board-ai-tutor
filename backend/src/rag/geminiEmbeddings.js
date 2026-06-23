/**
 * geminiEmbeddings.js
 *
 * Creates embedding instances for use in the indexing pipeline and at query time.
 * Provider is controlled by the EMBEDDING_PROVIDER env var:
 *
 *   EMBEDDING_PROVIDER=google (default) → Gemini gemini-embedding-001 (3072 dims)
 *   EMBEDDING_PROVIDER=openai           → OpenAI text-embedding-3-large (3072 dims)
 *
 * Both providers output 3072-dimensional vectors — MongoDB Atlas Vector Search
 * index does NOT need to be reconfigured when switching between them.
 *
 * IMPORTANT: indexing and retrieval must always use the same provider.
 * If you switch EMBEDDING_PROVIDER, re-run: npm run rag:index
 */

import { TaskType } from '@google/generative-ai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OpenAIEmbeddings } from '@langchain/openai';

const PROVIDER = (process.env.EMBEDDING_PROVIDER || 'google').toLowerCase();

export const GEMINI_EMBEDDING_MODEL =
  PROVIDER === 'openai' ? 'text-embedding-3-large' : 'gemini-embedding-001';

export const EMBEDDING_PROVIDER =
  PROVIDER === 'openai' ? 'openai' : 'google-generative-ai-langchain';

// ─── Google / Gemini path ────────────────────────────────────────────────────

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

/**
 * Extends GoogleGenerativeAIEmbeddings to embed documents one at a time
 * with retry logic. Avoids batch API issues.
 */
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
    // Embed sequentially to avoid Gemini batch API empty-vector issue
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

const createGoogleEmbeddings = (taskType) =>
  new SequentialGoogleGenerativeAIEmbeddings({
    apiKey: getGoogleApiKey(),
    modelName: GEMINI_EMBEDDING_MODEL,
    taskType,
    maxConcurrency: 1,
    maxRetries: 0,
  });

// ─── OpenAI path ─────────────────────────────────────────────────────────────

const createOpenAIEmbeddings = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length < 10 || apiKey.includes('your_')) {
    throw new Error('OPENAI_API_KEY is missing or invalid. Required when EMBEDDING_PROVIDER=openai.');
  }
  // text-embedding-3-large outputs 3072 dims by default — matches the existing
  // MongoDB Atlas Vector Search index, so no Atlas reconfiguration is needed.
  return new OpenAIEmbeddings({
    apiKey,
    model: 'text-embedding-3-large',
    dimensions: 3072,
  });
};

// ─── Public API (same interface regardless of provider) ──────────────────────

/** Use this when embedding content chunks during indexing (npm run rag:index) */
export const createDocumentEmbeddings = () =>
  PROVIDER === 'openai'
    ? createOpenAIEmbeddings()
    : createGoogleEmbeddings(TaskType.RETRIEVAL_DOCUMENT);

/** Use this when embedding the student's search query at runtime */
export const createQueryEmbeddings = () =>
  PROVIDER === 'openai'
    ? createOpenAIEmbeddings()
    : createGoogleEmbeddings(TaskType.RETRIEVAL_QUERY);
