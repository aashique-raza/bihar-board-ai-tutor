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

import { loadRetrieverVectorStore } from '../rag/retriever.js';
import { createQueryEmbeddings } from '../rag/geminiEmbeddings.js';
import { retrieverConfig } from '../rag/retriever.config.js';

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
    const loaded = await loadRetrieverVectorStore(retrieverConfig.vectorStorePath, embeddings);

    // top-1 only — we only need the highest similarity score, not full retrieval
    const results = await loaded.vectorStore.similaritySearchWithScore(String(query || ''), 1);
    const score = results?.[0]?.[1] ?? 0;
    const threshold = getThreshold();

    return { score, fired: score >= threshold };
  } catch (err) {
    // Fail open — probe failure must never crash or stall the pipeline
    console.warn('[SafetyNet] Probe failed, skipping override:', err.message);
    return { score: 0, fired: false };
  }
};
