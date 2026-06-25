/**
 * retriever.config.js
 *
 * Configuration constants for the RAG retriever.
 */

export const retrieverConfig = {
  // How many top results to return after reranking
  defaultTopK: 5,

  // Minimum similarity score — results below this are discarded.
  // OpenAI text-embedding-3-large cosine scores: relevant content ~0.55-0.75,
  // unrelated chapters ~0.30-0.45. 0.55 is the proven discrimination floor.
  defaultMinScore: 0.55,

  // Expected embedding vector dimension (OpenAI text-embedding-3-large & Gemini gemini-embedding-001 both = 3072)
  expectedEmbeddingDimension: 3072,
};
