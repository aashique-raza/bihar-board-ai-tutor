/**
 * intentSafetyNet.js
 *
 * Layer 2.2 — Code-side academic safety net.
 *
 * When the decider (8B model) classifies a message as GREETING or OUT_OF_CONTEXT,
 * this probe checks if the message actually contains academic content by running
 * a fast vector similarity check (top-1 result only).
 *
 * Design decisions:
 * - Language-agnostic: Gemini multilingual embeddings handle Hindi, Hinglish, English.
 * - Fail-open: any error returns { fired: false } — pipeline is never blocked by probe failure.
 * - Zero extra disk I/O: vectorStoreLoader caches the store after first load (see vectorStoreLoader.js).
 * - Threshold is env-configurable: tune in production without code changes.
 *
 * Score scale: cosine similarity 0–1 (higher = more relevant).
 * Default threshold 0.65 matches the retriever's FINAL_SCORE_THRESHOLD (retriever.js line 26).
 */

import { Chunk } from '../models/chunk.model.js';
import { createQueryEmbeddings } from '../rag/geminiEmbeddings.js';

const getThreshold = () =>
  parseFloat(process.env.SAFETY_NET_SIMILARITY_THRESHOLD ?? '0.65');

/**
 * Probes whether a query has relevant academic content in the indexed vector store.
 *
 * @param {string} query - The student's raw message (any language)
 * @returns {Promise<{ score: number, fired: boolean }>}
 *   score  — top-1 cosine similarity (0–1)
 *   fired  — true if score >= threshold → caller should upgrade intent to CONCEPT_QUESTION
 */
export const probeAcademicSimilarity = async (query) => {
  try {
    const embeddings = createQueryEmbeddings();
    const queryEmbedding = await embeddings.embedQuery(String(query || ''));
    
    const pipeline = [
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 5,
          limit: 1
        }
      },
      {
        $project: {
          _id: 0,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ];
    
    const results = await Chunk.aggregate(pipeline);
    const score = results?.[0]?.score ?? 0;
    const threshold = getThreshold();

    return { score, fired: score >= threshold };
  } catch (err) {
    // Fail open — probe failure must never crash or stall the pipeline
    console.warn('[SafetyNet] Probe failed, skipping override:', err.message);
    return { score: 0, fired: false };
  }
};
