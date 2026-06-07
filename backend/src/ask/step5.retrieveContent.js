/**
 * step5.retrieveContent.js — Step 5 of the Ask API flow
 * * PRODUCTION-GRADE ORCHESTRATOR COMPONENT
 */

import { retrieveRelevantChunks } from '../rag/retriever.js';
import { formatSources } from '../rag/sourceFormatter.js';
import { formatRetrievedContext } from './promptHelpers.js';
import { getNextTopic } from '../curriculum/nextTopicResolver.js';

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

const buildTopicSearchQuery = (topic) => {
  // ragHints[0] is a structural heading title — embeds poorly as semantic query
  // Instead, build a natural question-style query from the topic title
  // This scores much higher against content chunks in the vector store

  const title = topic.title
    .replace(/^\d+\.\s*/, '')  // remove leading "1. " numbering
    .trim();

  // Use chapter context + topic title as semantic query
  // e.g. "Electricity Electric Current and Electric Circuit"
  return `${topic.chapterTitle} ${title}`;
};

/**
 * Step 5: Search the vector store for relevant content.
 * Bypasses immediately if Step 4 router evaluated needsRetrieval as false.
 */
export const retrieveContent = async ({ needsRetrieval, searchQuery, intent }, { focusChapter }, { chatState }) => {
  console.log('[DEBUG step5] intent:', intent);
  console.log('[DEBUG step5] chatState.currentChapterId:', chatState?.currentChapterId);
  console.log('[DEBUG step5] chatState.currentTopicId:', chatState?.currentTopicId);
  console.log(`[Step 5 Execution] Initiating Retrieval Decision Verification. Required: ${needsRetrieval}`);

  // NEXT_STEP: resolve the next core topic first, then retrieve content for it
  if (intent === 'NEXT_STEP') {
    const result = await getNextTopic(chatState.currentChapterId, chatState.currentTopicId);

    if (result.status === 'no_chapter') {
      return {
        retrieval: null, chunks: [], sources: [],
        retrievedContext: 'NO_RETRIEVED_CONTEXT',
        nextTopicSignal: null,
      };
    }

    if (result.status === 'chapter_complete') {
      return {
        retrieval: null, chunks: [], sources: [],
        retrievedContext: 'CHAPTER_COMPLETE',
        nextTopicSignal: null,
      };
    }

    // status === 'found': retrieve content for the resolved next topic
    const topicSearchQuery = buildTopicSearchQuery(result.topic);
    console.log(`[Step 5 NEXT_STEP] Fetching content for next topic: "${result.topic.title}"`);

    const nextRetrieval = await retrieveRelevantChunks(topicSearchQuery, getRetrieverOptions(focusChapter));
    const nextChunks = nextRetrieval.results || [];

    return {
      retrieval: nextRetrieval,
      chunks: nextChunks,
      sources: formatSources(nextChunks),
      retrievedContext: formatRetrievedContext(nextChunks),
      nextTopicSignal: { topicId: result.topic.topicId, title: result.topic.title },
    };
  }

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