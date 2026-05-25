/**
 * sourceFormatter.js
 *
 * Formats raw retrieved chunks into clean, deduplicated source objects
 * for attachment to the API response.
 *
 * WHY THIS EXISTS:
 *   The retriever returns raw document chunks. Multiple chunks may come from
 *   the same chapter section. This module deduplicates them by section,
 *   assigns numbered labels ("Source 1", "Source 2"), and builds structured
 *   source objects that the frontend can display.
 *
 * MAIN EXPORT:
 *   formatSources(chunks) → array of source objects
 */

const cleanText = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const normalizeForComparison = (text) =>
  cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const getHeadingParts = (headingPath) =>
  String(headingPath || '')
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Extracts the leaf (most specific) heading from a heading path like:
 * "Chapter 1 > Life Processes > Nutrition" → "Nutrition"
 */
const cleanTopicTitle = (headingPath, chapterTitle) => {
  const parts = getHeadingParts(headingPath);
  const leaf = parts[parts.length - 1] || chapterTitle || 'Unknown topic';
  return leaf
    .replace(/^chapter\s+\d+\s*:\s*/i, '')
    .replace(/^\d+\.?\s*/, '')
    .trim() || 'Unknown topic';
};

// Unique key per source: chapter + heading path combined
const createSourceKey = ({ chapterTitle, headingPath }) =>
  `${normalizeForComparison(chapterTitle)}::${normalizeForComparison(headingPath)}`;

// Human-readable label: "Chemical Reactions and Equations - Key Definitions"
const createSourceLabel = ({ chapterTitle, topicTitle }) =>
  topicTitle && topicTitle !== chapterTitle
    ? `${chapterTitle} - ${topicTitle}`
    : chapterTitle;

/**
 * Converts a list of raw retrieval chunks into deduplicated source objects.
 * Chunks from the same heading section are merged into one source entry.
 *
 * @param {Array} chunks - Raw result objects from retrieveRelevantChunks()
 * @returns {Array}      - Deduplicated, numbered source objects
 */
export const formatSources = (chunks) =>
  chunks.reduce((sources, chunk) => {
    const metadata = chunk.metadata || {};
    const chapterTitle = metadata.chapter_title || 'Unknown';
    const headingPath = metadata.heading_path || 'Unknown';
    const topicTitle = cleanTopicTitle(headingPath, chapterTitle);
    const chunkId = metadata.chunk_id || chunk.id || 'Unknown';
    const key = createSourceKey({ chapterTitle, headingPath });

    // If this heading was already added, just append the chunk ID
    const existingSource = sources.find((source) => source.sourceId === key);
    if (existingSource) {
      existingSource.chunkIds = [...new Set([...existingSource.chunkIds, chunkId])];
      return sources;
    }

    const sourceNumber = sources.length + 1;
    const source = {
      sourceNumber,
      sourceId: key,
      label: `Source ${sourceNumber}: ${createSourceLabel({ chapterTitle, topicTitle })}`,
      sourceTitle: createSourceLabel({ chapterTitle, topicTitle }),
      chapter_title: chapterTitle,
      chapterTitle,
      topicTitle,
      section: metadata.section || 'Unknown',
      sectionTitle: metadata.section || 'Unknown',
      heading_path: headingPath,
      headingPath,
      chunk_id: chunkId,
      chunkId,
      chunkIds: [chunkId],
    };

    return [...sources, source];
  }, []);
