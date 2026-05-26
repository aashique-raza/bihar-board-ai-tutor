/**
 * step5.retrieveContent.js — Step 5 of the Ask API flow
 * * PRODUCTION-GRADE ORCHESTRATOR COMPONENT
 */

import { retrieveRelevantChunks } from '../rag/retriever.js';
import { formatSources } from '../rag/sourceFormatter.js';
import { formatRetrievedContext } from './promptHelpers.js';

/**
 * Builds retriever options with explicit boundaries.
 */
const getRetrieverOptions = (focusChapter) => {
  if (!focusChapter) {
    return {}; // Global Mode: search across all branches
  }

  return {
    metadataFilter: focusChapter.metadataFilter, // Scopes to e.g. { subject: 'Science', section: 'Biology', chapter_no: 1 }
    requireTermMatchForLatinQuery: true,          // Restricts loose embedding drifts
  };
};

/**
 * Step 5: Search the vector store for relevant content.
 * Bypasses immediately if Step 4 router evaluated needsRetrieval as false.
 */
export const retrieveContent = async ({ needsRetrieval, searchQuery }, { focusChapter }) => {
  console.log(`[Step 5 Execution] Initiating Retrieval Decision Verification. Required: ${needsRetrieval}`);

  // Short-circuit routing check
  if (!needsRetrieval) {
    console.log('[Step 5 Bypassed] Skipping vector database lookups due to conversational context routing rule.');
    return {
      retrieval: null,
      chunks: [],
      sources: [],
      retrievedContext: 'NO_RETRIEVED_CONTEXT',
    };
  }

  console.log(`[Step 5 DB Scan] Querying index vectors using computed target: "${searchQuery}"`);

  const retrieval = await retrieveRelevantChunks(
    searchQuery,
    getRetrieverOptions(focusChapter)
  );

  const chunks = retrieval.results || [];

  // Format candidate chunks into structural objects for user consumption
  const sources = formatSources(chunks);

  // Format document boundaries into text sections for the subsequent Tutor prompt
  const retrievedContext = formatRetrievedContext(chunks);

  console.log(`[Step 5 Complete] Successfully packaged ${chunks.length} ground truth chunks for text generation layer.`);

  return {
    retrieval,
    chunks,
    sources,
    retrievedContext,
  };
};