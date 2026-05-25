/**
 * step5.retrieveContent.js — Step 5 of the Ask API flow
 *
 * WHAT IT DOES:
 *   If the Decider (Step 4) said needsRetrieval=true, this step:
 *   1. Searches the vector store using the Decider's searchQuery
 *   2. Applies Focus Mode metadata filter (if chapterId was selected)
 *   3. Formats the raw chunks into clean source objects for the API response
 *
 *   If needsRetrieval=false (e.g., greeting, redirect), this step is skipped
 *   and returns empty results immediately.
 *
 * RETURNS:
 *   { retrieval, chunks, sources, retrievedContext }
 *
 *   retrieval       → raw retriever output (includes debug info)
 *   chunks          → top-K matched document chunks
 *   sources         → formatted, deduplicated source objects for the response
 *   retrievedContext → formatted text for the Tutor LLM prompt (Step 6)
 */

import { retrieveRelevantChunks } from '../rag/retriever.js';
import { formatSources } from '../rag/sourceFormatter.js';
import { formatRetrievedContext } from './promptHelpers.js';

/**
 * Builds retriever options.
 * In Focus Mode, adds a metadata filter so only that chapter's chunks are searched.
 */
const getRetrieverOptions = (focusChapter) => {
  if (!focusChapter) {
    return {}; // Global Mode: search all chunks
  }

  return {
    metadataFilter: focusChapter.metadataFilter, // e.g. { chapter_id: 'science.biology.chapter-01' }
    requireTermMatchForLatinQuery: true,          // Stricter matching in focused search
  };
};

/**
 * Step 5: Search the vector store for relevant content.
 * If retrieval is not needed, returns empty immediately.
 *
 * @param {{ needsRetrieval, searchQuery }} decision     - From Step 4
 * @param {{ focusChapter }}                 input       - From Step 1
 * @returns {{ retrieval, chunks, sources, retrievedContext }}
 */
export const retrieveContent = async ({ needsRetrieval, searchQuery }, { focusChapter }) => {
  // If the Decider said no retrieval needed (e.g. greeting), skip this step
  if (!needsRetrieval) {
    return {
      retrieval: null,
      chunks: [],
      sources: [],
      retrievedContext: 'NO_RETRIEVED_CONTEXT',
    };
  }

  // Search the vector store using the Decider's search query
  const retrieval = await retrieveRelevantChunks(
    searchQuery,
    getRetrieverOptions(focusChapter)
  );

  const chunks = retrieval.results || [];

  // Format chunks into deduplicated source objects (for the API response)
  const sources = formatSources(chunks);

  // Format chunks into a readable text block (for the Tutor LLM prompt)
  const retrievedContext = formatRetrievedContext(chunks);

  return {
    retrieval,
    chunks,
    sources,
    retrievedContext,
  };
};
