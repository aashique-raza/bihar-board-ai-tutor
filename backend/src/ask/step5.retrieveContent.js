/**
 * step5.retrieveContent.js — Step 5 of the Ask API flow
 * * PRODUCTION-GRADE ORCHESTRATOR COMPONENT
 */

import { retrieveRelevantChunks } from '../rag/retriever.js';
import { formatSources } from '../rag/sourceFormatter.js';
import { formatRetrievedContext } from './promptHelpers.js';
import { getNextTopic } from '../curriculum/nextTopicResolver.js';
import { getExamContext } from '../knowledge/examKnowledgeService.js';

const isDev = process.env.NODE_ENV !== 'production';

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

  // Strips leading numbering in both "4. " and decimal sub-numbering "4.1 "/"4.10 "
  // forms. The old pattern (/^\d+\.\s*/) only matched whole-number prefixes — for
  // "4.1 Combination Reaction" it consumed just "4." and left a stray "1 " behind,
  // degrading retrieval specificity enough that several sibling sub-topics (e.g.
  // this chapter's 8 "4.1"–"4.8" reaction types) all matched the same generic
  // "types of reactions" chunk instead of their own — producing near-identical
  // NEXT_STEP answers for genuinely different, correctly-advancing topics.
  const title = topic.title
    .replace(/^\d+(\.\d+)*\.?\s*/, '')
    .trim();

  // Use chapter context + topic title as semantic query
  // e.g. "Electricity Electric Current and Electric Circuit"
  return `${topic.chapterTitle} ${title}`;
};

/**
 * Step 5: Search the vector store for relevant content.
 * Bypasses immediately if Step 4 router evaluated needsRetrieval as false.
 */
export const retrieveContent = async ({ needsRetrieval, searchQuery, intent }, { focusChapter }, { chatState, chapterProgress }, abortSignal = null) => {
  if (abortSignal?.aborted) {
    if (isDev) console.log(`[Step 5] Aborting vector search early due to AbortSignal`);
    const error = new Error('AbortError');
    error.name = 'AbortError';
    throw error;
  }

  if (isDev) console.log(`[Step 5 Execution] Initiating Retrieval Decision Verification. Required: ${needsRetrieval}`);

  // NEXT_STEP: resolve the next core topic first, then retrieve content for it
  // currentTopicId now comes from ChapterProgress (single source of truth for topic
  // progress) rather than chatState — see FOCUS_MODE_PROGRESS_FIX_PLAN.md.
  if (intent === 'NEXT_STEP') {
    const currentTopicId = chapterProgress?.currentTopicId ?? null;
    const result = await getNextTopic(chatState.currentChapterId, currentTopicId);

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
    if (isDev) console.log(`[Step 5 NEXT_STEP] Fetching content for next topic: "${result.topic.title}"`);

    const nextRetrieval = await retrieveRelevantChunks(topicSearchQuery, getRetrieverOptions(focusChapter));
    const nextChunks = nextRetrieval.results || [];

    return {
      retrieval: nextRetrieval,
      chunks: nextChunks,
      sources: formatSources(nextChunks),
      retrievedContext: formatRetrievedContext(nextChunks),
      nextTopicSignal: { topicId: result.topic.topicId, title: result.topic.title },
      lastRetrievalQuery: topicSearchQuery,
    };
  }

  // EXPLAIN_MORE: re-retrieve the topic the student wants re-explained.
  // By design (see deciderPrompt.js), the decider ALWAYS returns searchQuery=null for
  // this intent — EXPLAIN_MORE means "re-explain what you just told me", so it
  // deliberately reuses saved session state (lastRetrievalQuery → lastTopic) instead
  // of extracting a fresh query. That design is sound; the bug was that this reused
  // state was never scoped to the focus chapter, so it could retrieve (and teach)
  // content from a completely different chapter with no warning. Passing focusChapter
  // here closes that gap the same way CONCEPT_QUESTION/NEXT_STEP already are scoped —
  // and if the reused query genuinely isn't from this chapter, the 0-chunks branch
  // below already asks the student to clarify instead of guessing globally.
  if (intent === 'EXPLAIN_MORE') {
    const topicQuery = searchQuery || chatState?.lastRetrievalQuery || chatState?.lastTopic || null;

    if (!topicQuery) {
      if (isDev) console.log('[Step 5 EXPLAIN_MORE] No query available (searchQuery=null, lastTopic=null) — empty context, tutor will ask student to clarify topic.');
      return {
        retrieval: null, chunks: [], sources: [],
        retrievedContext: 'NO_RETRIEVED_CONTEXT',
        nextTopicSignal: null,
      };
    }

    const querySource = chatState?.lastRetrievalQuery ? 'chatState.lastRetrievalQuery' : 'chatState.lastTopic';
    if (isDev) console.log(`[Step 5 EXPLAIN_MORE] Re-retrieving via ${querySource}: "${topicQuery}"`);

    const explainRetrieval = await retrieveRelevantChunks(topicQuery, getRetrieverOptions(focusChapter));
    const explainChunks = explainRetrieval.results || [];

    if (!explainChunks.length) {
      if (isDev) console.log(`[Step 5 EXPLAIN_MORE] 0 chunks returned for "${topicQuery}" — empty context, tutor will ask student to clarify.`);
      return {
        retrieval: null, chunks: [], sources: [],
        retrievedContext: 'NO_RETRIEVED_CONTEXT',
        nextTopicSignal: null,
      };
    }

    if (isDev) console.log(`[Step 5 EXPLAIN_MORE] ${explainChunks.length} chunks retrieved for re-explanation.`);
    return {
      retrieval: explainRetrieval,
      chunks: explainChunks,
      sources: formatSources(explainChunks),
      retrievedContext: formatRetrievedContext(explainChunks),
      nextTopicSignal: null,
    };
  }

  // EXAM_INFO: deterministic knowledge base lookup — bypasses vector search entirely.
  // examKnowledgeService reads data/class-10/global/exam_patterns.json (not in vector store).
  // Returns formatted context string injected into the tutor LLM as {retrievedContext}.
  // Step 6 (tutor LLM) does not need to know this came from JSON, not vector search.
  if (intent === 'EXAM_INFO') {
    if (isDev) console.log('[Step 5 EXAM_INFO] Knowledge Service lookup — no vector search');
    const examContext = getExamContext();
    return {
      retrieval: null,
      chunks: [],
      sources: [],
      retrievedContext: examContext,
      nextTopicSignal: null,
      lastRetrievalQuery: null,
    };
  }

  // Short-circuit routing check
  if (!needsRetrieval) {
    if (isDev) console.log('[Step 5 Bypassed] Skipping vector database lookups due to conversational context routing rule.');
    return {
      retrieval: null,
      chunks: [],
      sources: [],
      retrievedContext: 'NO_RETRIEVED_CONTEXT',
    };
  }

  if (isDev) console.log(`[Step 5 DB Scan] Querying index vectors using computed target: "${searchQuery}"`);

  const retrieval = await retrieveRelevantChunks(
    searchQuery,
    getRetrieverOptions(focusChapter)
  );

  const chunks = retrieval.results || [];

  // OUT-OF-FOCUS FALLBACK — CONCEPT_QUESTION only.
  // Focus retrieval returned 0 chunks, but the topic may exist in a different chapter.
  // Run a global search (no metadataFilter) to confirm before saying "not in material".
  if (intent === 'CONCEPT_QUESTION' && focusChapter && chunks.length === 0) {
    if (isDev) console.log(`[Step 5 OOF] Focus retrieval returned 0 — running global fallback for: "${searchQuery}"`);

    const globalRetrieval = await retrieveRelevantChunks(searchQuery, { topK: 3 });
    const globalChunks = globalRetrieval.results || [];

    if (globalChunks.length > 0) {
      if (isDev) console.log(`[Step 5 OOF] Global fallback found ${globalChunks.length} chunk(s) — topic exists outside focus chapter.`);
      return {
        retrieval: globalRetrieval,
        chunks: globalChunks,
        sources: formatSources(globalChunks),
        retrievedContext: formatRetrievedContext(globalChunks),
        isOutOfFocusAnswer: true,
        outOfFocusChapter: {
          section:   globalChunks[0]?.metadata?.section   || null,
          chapterNo: globalChunks[0]?.metadata?.chapter_no || null,
        },
        lastRetrievalQuery: searchQuery,
      };
    }

    if (isDev) console.log(`[Step 5 OOF] Global fallback also returned 0 — topic not in material.`);
    return {
      retrieval: null, chunks: [], sources: [],
      retrievedContext: 'NO_RETRIEVED_CONTEXT',
      lastRetrievalQuery: searchQuery,
    };
  }

  // Format candidate chunks into structural objects for user consumption
  const sources = formatSources(chunks);

  // Format document boundaries into text sections for the subsequent Tutor prompt
  const retrievedContext = formatRetrievedContext(chunks);

  if (isDev) console.log(`[Step 5 Complete] Successfully packaged ${chunks.length} ground truth chunks for text generation layer.`);

  return {
    retrieval,
    chunks,
    sources,
    retrievedContext,
    lastRetrievalQuery: searchQuery,
  };
};