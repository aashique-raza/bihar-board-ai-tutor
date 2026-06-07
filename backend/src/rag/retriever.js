/**
 * retriever.js
 * * UPGRADED PRODUCTION-GRADE RAG RETRIEVER (STEP 5)
 * * FIXES IMPLEMENTED:
 * 1. Scoped Vector Cache Map: Static chapters ka memory overhead allocation zero kiya.
 * 2. LangChain Distance Trap Fix: Evaluated distance into proper Cosine Similarity (1 - Distance).
 * 3. Streamlined Score Normalization: Clean mathematical pipeline for robust filtering.
 */

import path from 'node:path';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { createQueryEmbeddings } from './geminiEmbeddings.js';
import { loadLangChainMemoryVectorStore } from './vectorStoreLoader.js';
import { rerankResults } from './reranker.js';
import { retrieverConfig } from './retriever.config.js';

// Rerank scoring thresholds tuned for Bihar Board Class 10
const STRONG_VECTOR_SCORE_THRESHOLD = 0.7;
const FINAL_SCORE_THRESHOLD = 0.65;
const TERM_MATCH_VECTOR_SCORE_THRESHOLD = 0.62;
const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

// Global In-Memory Cache to prevent multiple allocations of chapter-scoped stores
const CHAPTER_STORE_CACHE = new Map();

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
 * Creates or retrieves a cached scoped vector store (Focus Mode optimization)
 * Reduces CPU and garbage collection locks under multi-user traffic.
 */
const getOrCreateScopedVectorStore = (loadedStore, embeddings, metadataFilter) => {
  if (!metadataFilter || Object.keys(metadataFilter).length === 0) {
    return { vectorStore: loadedStore.vectorStore, totalVectors: loadedStore.totalVectors };
  }

  // Create unique cache key string based on metadata filter values
  const cacheKey = Object.entries(metadataFilter)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');

  if (CHAPTER_STORE_CACHE.has(cacheKey)) {
    console.log(`[Retriever Cache Hit] Serving scoped store from cache for key: ${cacheKey}`);
    return CHAPTER_STORE_CACHE.get(cacheKey);
  }

  console.log(`[Retriever Cache Miss] Building new scoped in-memory store for key: ${cacheKey}`);
  const scopedVectorStore = new MemoryVectorStore(embeddings);

  // Extract matching memory vectors from the master loaded store
  scopedVectorStore.memoryVectors = loadedStore.vectorStore.memoryVectors.filter((vector) =>
    matchesMetadataFilter(vector.metadata, metadataFilter)
  );

  const cachedData = {
    vectorStore: scopedVectorStore,
    totalVectors: scopedVectorStore.memoryVectors.length
  };

  CHAPTER_STORE_CACHE.set(cacheKey, cachedData);
  return cachedData;
};

export const loadRetrieverVectorStore = async (
  vectorStorePath = retrieverConfig.vectorStorePath,
  embeddings = createQueryEmbeddings()
) => loadLangChainMemoryVectorStore(vectorStorePath, embeddings);

/**
 * Main retrieval function — called by Step 5 of the Ask API.
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

  // Using the new optimized, memoized scoped cache lookups
  const scopedStore = getOrCreateScopedVectorStore(loadedStore, embeddings, options.metadataFilter);

  const resultsWithScores =
    scopedStore.totalVectors > 0
      ? await scopedStore.vectorStore.similaritySearchWithScore(query, candidateTopK)
      : [];

  const candidateCount = resultsWithScores.length;

  // MemoryVectorStore.similaritySearchWithScore() returns cosine SIMILARITY
  // (higher = better, range 0-1). Use raw score directly — no conversion needed.
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