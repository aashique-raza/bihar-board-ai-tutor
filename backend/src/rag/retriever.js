/**
 * retriever.js
 *
 * The RAG retriever — Step 5 of the Ask API flow.
 *
 * HOW IT WORKS:
 *   1. Load the in-memory vector store (from vector-store.json)
 *   2. Optionally scope to a specific chapter using metadataFilter (Focus Mode)
 *   3. Run vector similarity search to get candidate chunks
 *   4. Rerank those candidates using keyword + intent signals
 *   5. Apply a final score filter and return the top-K results
 *
 * MAIN EXPORT:
 *   retrieveRelevantChunks(question, options) → { results, debug, ... }
 *
 * OPTIONS:
 *   - topK           → max results to return (default: 5)
 *   - minScore       → minimum vector similarity (default: 0.55)
 *   - metadataFilter → e.g. { chapter_id: 'science.biology.chapter-01' } for Focus Mode
 *   - vectorStorePath → override the default vector store file path
 */

import path from 'node:path';

import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';

import { createQueryEmbeddings } from './geminiEmbeddings.js';
import { loadLangChainMemoryVectorStore } from './vectorStoreLoader.js';
import { rerankResults } from './reranker.js';
import { retrieverConfig } from './retriever.config.js';

// Rerank scoring thresholds (tuned for class 10 content)
const STRONG_VECTOR_SCORE_THRESHOLD = 0.7;
const FINAL_SCORE_THRESHOLD = 0.65;
const TERM_MATCH_VECTOR_SCORE_THRESHOLD = 0.62;
const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

const normalizeRetrieverOptions = ({ topK, minScore } = {}) => {
  const parsedTopK = Number(topK);
  const parsedMinScore = Number(minScore);
  return {
    topK: Number.isInteger(parsedTopK) && parsedTopK > 0 ? parsedTopK : retrieverConfig.defaultTopK,
    minScore: Number.isFinite(parsedMinScore) ? parsedMinScore : retrieverConfig.defaultMinScore,
  };
};

const hasMatchedTerms = (result) =>
  Array.isArray(result.rerankDebug?.matchedTerms) && result.rerankDebug.matchedTerms.length > 0;

const isStrongVectorFallback = (result) =>
  result.score >= STRONG_VECTOR_SCORE_THRESHOLD;

const isDevanagariQuery = (query) => DEVANAGARI_PATTERN.test(query);

// A result passes if its combined rerank score meets the threshold,
// or if it's a strong pure-vector match, or if the query is Hindi (Devanagari)
const passesFinalFilter = (result, query, options = {}) => {
  if (options.requireTermMatchForLatinQuery && !isDevanagariQuery(query) && !hasMatchedTerms(result)) {
    return false;
  }
  return (
    (result.finalScore >= FINAL_SCORE_THRESHOLD ||
      (hasMatchedTerms(result) && result.score >= TERM_MATCH_VECTOR_SCORE_THRESHOLD)) &&
    (hasMatchedTerms(result) || isStrongVectorFallback(result) || isDevanagariQuery(query))
  );
};

const matchesMetadataFilter = (metadata, filter = {}) =>
  Object.entries(filter).every(([key, value]) => metadata?.[key] === value);

/**
 * Creates a scoped vector store (for Focus Mode).
 * If no metadataFilter is given, returns the full store unchanged.
 */
const createScopedVectorStore = (loadedStore, embeddings, metadataFilter) => {
  if (!metadataFilter || Object.keys(metadataFilter).length === 0) {
    return { vectorStore: loadedStore.vectorStore, totalVectors: loadedStore.totalVectors };
  }

  const scopedVectorStore = new MemoryVectorStore(embeddings);
  scopedVectorStore.memoryVectors = loadedStore.vectorStore.memoryVectors.filter((vector) =>
    matchesMetadataFilter(vector.metadata, metadataFilter)
  );

  return { vectorStore: scopedVectorStore, totalVectors: scopedVectorStore.memoryVectors.length };
};

export const loadRetrieverVectorStore = async (
  vectorStorePath = retrieverConfig.vectorStorePath,
  embeddings = createQueryEmbeddings()
) => loadLangChainMemoryVectorStore(vectorStorePath, embeddings);

/**
 * Main retrieval function — called by Step 5 of the Ask API.
 *
 * @param {string} question - The search query (often from the Decider's searchQuery)
 * @param {object} options  - See file header for available options
 * @returns {{ question, results, topK, minScore, debug, ... }}
 */
export const retrieveRelevantChunks = async (question, options = {}) => {
  const query = String(question || '').trim();

  if (!query) {
    throw new Error('Question cannot be empty.');
  }

  const { topK, minScore } = normalizeRetrieverOptions(options);
  const candidateTopK = options.candidateTopK || Math.max(topK * 4, 20);
  const vectorStorePath = options.vectorStorePath || retrieverConfig.vectorStorePath;
  const embeddings = options.embeddings || createQueryEmbeddings();

  const loadedStore = await loadRetrieverVectorStore(vectorStorePath, embeddings);
  const scopedStore = createScopedVectorStore(loadedStore, embeddings, options.metadataFilter);

  const resultsWithScores =
    scopedStore.totalVectors > 0
      ? await scopedStore.vectorStore.similaritySearchWithScore(query, candidateTopK)
      : [];

  const candidateCount = resultsWithScores.length;

  // Normalize LangChain results to plain objects
  const candidates = resultsWithScores
    .filter(([, score]) => score >= minScore)
    .map(([document, score]) => ({
      id: document.id || document.metadata?.chunk_id,
      content: document.pageContent,
      metadata: document.metadata || {},
      score,
    }));

  // Apply custom keyword + intent reranking
  const rerankedResults = rerankResults(query, candidates);

  // Apply final combined score filter
  const filteredResults = rerankedResults.filter((result) =>
    passesFinalFilter(result, query, options)
  );

  const results = filteredResults.slice(0, topK);

  return {
    question: query,
    topK,
    minScore,
    vectorStorePath: path.resolve(vectorStorePath),
    totalVectors: scopedStore.totalVectors,
    embeddingDimension: loadedStore.embeddingDimension,
    debug: {
      candidateCountBeforeRerank: candidateCount,
      countAfterMinScore: candidates.length,
      countAfterFinalFiltering: filteredResults.length,
      returnedCount: results.length,
    },
    results,
  };
};
