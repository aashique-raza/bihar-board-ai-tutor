import path from 'node:path';

import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';

import { createQueryEmbeddings } from '../../indexing/embeddings/langchainGeminiEmbeddings.js';
import { loadLangChainMemoryVectorStore } from './langchainMemoryStore.js';
import { rerankResults } from '../reranker/reranker.js';
import { retrieverConfig } from './retriever.config.js';

const STRONG_VECTOR_SCORE_THRESHOLD = 0.7;
const FINAL_SCORE_THRESHOLD = 0.65;
const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

const normalizeRetrieverOptions = ({ topK, minScore } = {}) => {
  const parsedTopK = Number(topK);
  const parsedMinScore = Number(minScore);

  const normalizedTopK = Number.isInteger(parsedTopK) && parsedTopK > 0
    ? parsedTopK
    : retrieverConfig.defaultTopK;

  const normalizedMinScore = Number.isFinite(parsedMinScore)
    ? parsedMinScore
    : retrieverConfig.defaultMinScore;

  return {
    topK: normalizedTopK,
    minScore: normalizedMinScore,
  };
};

const hasMatchedTerms = (result) =>
  Array.isArray(result.rerankDebug?.matchedTerms) &&
  result.rerankDebug.matchedTerms.length > 0;

const isStrongVectorFallback = (result) =>
  result.score >= STRONG_VECTOR_SCORE_THRESHOLD;

const isDevanagariQuery = (query) => DEVANAGARI_PATTERN.test(query);

const passesFinalFilter = (result, query) =>
  result.finalScore >= FINAL_SCORE_THRESHOLD &&
  (hasMatchedTerms(result) || isStrongVectorFallback(result) || isDevanagariQuery(query));

const matchesMetadataFilter = (metadata, filter = {}) =>
  Object.entries(filter).every(([key, value]) => metadata?.[key] === value);

const createScopedVectorStore = (loadedStore, embeddings, metadataFilter) => {
  if (!metadataFilter || Object.keys(metadataFilter).length === 0) {
    return {
      vectorStore: loadedStore.vectorStore,
      totalVectors: loadedStore.totalVectors,
    };
  }

  const scopedVectorStore = new MemoryVectorStore(embeddings);
  scopedVectorStore.memoryVectors = loadedStore.vectorStore.memoryVectors.filter((vector) =>
    matchesMetadataFilter(vector.metadata, metadataFilter)
  );

  return {
    vectorStore: scopedVectorStore,
    totalVectors: scopedVectorStore.memoryVectors.length,
  };
};

export const loadRetrieverVectorStore = async (
  vectorStorePath = retrieverConfig.vectorStorePath,
  embeddings = createQueryEmbeddings()
) => loadLangChainMemoryVectorStore(vectorStorePath, embeddings);

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
  const candidates = resultsWithScores
    .filter(([, score]) => score >= minScore)
    .map(([document, score]) => ({
      id: document.id || document.metadata?.chunk_id,
      content: document.pageContent,
      metadata: document.metadata || {},
      score,
    }));
  const rerankedResults = rerankResults(query, candidates);
  const filteredResults = rerankedResults.filter((result) => passesFinalFilter(result, query));
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
