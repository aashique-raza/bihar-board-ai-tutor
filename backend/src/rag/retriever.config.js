/**
 * retriever.config.js
 *
 * Configuration constants for the RAG retriever.
 */

export const retrieverConfig = {
  // How many top results to return after reranking
  defaultTopK: 5,

  // Minimum similarity score — results below this are discarded
  defaultMinScore: 0.55,

  // Expected embedding vector dimension (Gemini = 3072)
  expectedEmbeddingDimension: 3072,
};
