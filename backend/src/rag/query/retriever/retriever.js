import path from 'node:path';

import { createQueryEmbeddings } from '../../indexing/embeddings/langchainGeminiEmbeddings.js';
import { loadLangChainMemoryVectorStore } from './langchainMemoryStore.js';
import { rerankResults } from '../reranker/reranker.js';
import { retrieverConfig } from './retriever.config.js';

const STRONG_VECTOR_SCORE_THRESHOLD = 0.7;
const FINAL_SCORE_THRESHOLD = 0.65;

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

const passesFinalFilter = (result) =>
  result.finalScore >= FINAL_SCORE_THRESHOLD &&
  (hasMatchedTerms(result) || isStrongVectorFallback(result));

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
  const resultsWithScores = await loadedStore.vectorStore.similaritySearchWithScore(
    query,
    candidateTopK
  );
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
  const filteredResults = rerankedResults.filter(passesFinalFilter);
  const results = filteredResults.slice(0, topK);

  return {
    question: query,
    topK,
    minScore,
    vectorStorePath: path.resolve(vectorStorePath),
    totalVectors: loadedStore.totalVectors,
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
