/**
 * reranker.js
 *
 * Custom keyword + intent reranker for RAG results.
 *
 * HOW IT WORKS:
 *   After vector similarity search returns candidate chunks, this reranker
 *   adjusts each chunk's score based on:
 *   1. Keyword matches — does the chunk's heading/chapter/content contain query terms?
 *   2. Intent signals  — is the student asking for a definition? a function? an activity?
 *   3. Penalties       — penalize irrelevant chunk types (e.g., flowcharts for function questions)
 *   4. Diversity       — penalize chunks from the same parent section to encourage variety
 *
 * MAIN EXPORT:
 *   rerankResults(query, results) → sorted array of results with finalScore
 */

// Short common words that don't carry meaning — excluded from keyword matching
const WEAK_QUERY_TERMS = new Set([
  'kya', 'hai', 'ka', 'ki', 'ke', 'ko', 'me', 'mein',
  'in', 'of', 'and', 'explain', 'karo', 'what', 'is', 'are',
  'the', 'function', 'define', 'human', 'humans', 'beings',
  'hota', 'hoti', 'hote',
]);

// Score boost/penalty constants (tuned empirically)
const HEADING_TERM_BOOST = 0.08;
const PARENT_HEADING_TERM_BOOST = 0.04;
const CHAPTER_TERM_BOOST = 0.04;
const CONTENT_TERM_BOOST = 0.015;
const OVERVIEW_INTENT_BOOST = 0.055;
const MAIN_HEADING_INTENT_BOOST = 0.115;
const DIRECT_FUNCTION_INTENT_BOOST = 0.07;
const RELATED_FUNCTION_INTENT_BOOST = 0.04;
const QA_WITHOUT_HEADING_MATCH_PENALTY = 0.06;
const CONTENT_ONLY_MATCH_PENALTY = 0.035;
const ACTIVITY_DEFINITION_PENALTY = 0.05;
const FLOWCHART_FUNCTION_PENALTY = 0.11;
const DIVERSITY_PENALTY = 0.035;

const normalizeText = (text) => String(text || '').toLowerCase();

const includesAny = (text, terms) =>
  terms.some((term) => text.includes(term));

// Word-tokenizes text (Unicode-aware — works for Devanagari as well as Latin script,
// unlike a \b regex boundary which only recognizes [A-Za-z0-9_] as "word" characters).
// Used anywhere a query term (arbitrary user input) is checked against chunk text —
// raw substring checks there let a short real word (e.g. "are") false-match inside an
// unrelated longer word (e.g. "compare"), pulling in wrong-chapter content. Fixed-vocabulary
// checks (e.g. matching against a hardcoded ['overview','summary'] list) keep using
// includesAny() above — that list is developer-curated, not arbitrary user input, so the
// same false-substring risk doesn't apply there.
const tokenize = (text) => new Set(String(text || '').match(/[\p{L}\p{N}]+/gu) || []);

const tokenIncludesAny = (text, terms) => {
  const tokens = tokenize(text);
  return terms.some((term) => tokens.has(term));
};

// Expands related query terms (e.g. "digestion" also matches "digestive")
const expandQueryTerm = (term) => {
  if (term === 'digestion' || term === 'digestive') return ['digestion', 'digestive', 'digest'];
  if (term === 'circulation' || term === 'circulatory') return ['circulation', 'circulatory'];
  return [term];
};

/**
 * Extracts meaningful keywords from the query, filtering out weak terms.
 */
export const extractQueryTerms = (query) => {
  const terms = normalizeText(query).match(/[\p{L}\p{N}]+/gu) || [];
  const usefulTerms = terms.filter((term) =>
    term.length > 1 && !WEAK_QUERY_TERMS.has(term)
  );
  return [...new Set(usefulTerms.flatMap(expandQueryTerm))];
};

const detectQueryIntent = (query) => {
  const normalizedQuery = normalizeText(query);
  const isDefinitionOrExplanation = includesAny(normalizedQuery, ['kya hai', 'hota hai', 'explain', 'define', 'what is', 'meaning']);
  const isFunction = includesAny(normalizedQuery, ['function', 'ka function', 'role', 'work', 'kaam']);
  const asksForActivity = includesAny(normalizedQuery, ['activity', 'experiment', 'practical']);
  return {
    isDefinitionOrExplanation,
    isFunction,
    asksForActivity,
    label: [
      isDefinitionOrExplanation ? 'definition_or_explanation' : null,
      isFunction ? 'function' : null,
    ].filter(Boolean).join('+') || 'specific',
  };
};

const getHeadingParts = (headingPath) =>
  String(headingPath || '').split('>').map((part) => part.trim()).filter(Boolean);

const getImmediateParentHeading = (headingPath) => {
  const parts = getHeadingParts(headingPath);
  return parts.length <= 1 ? (parts[0] || 'unknown') : parts[parts.length - 2];
};

const getLeafHeading = (headingPath) => {
  const parts = getHeadingParts(headingPath);
  return parts[parts.length - 1] || '';
};

const hasHeadingTermMatch = (matchedTerms) =>
  matchedTerms.some((match) => match.fields.includes('heading_path'));

const hasChapterTermMatch = (matchedTerms) =>
  matchedTerms.some((match) => match.fields.includes('chapter_title'));

const hasOnlyContentMatches = (matchedTerms) =>
  matchedTerms.length > 0 &&
  matchedTerms.every((match) => match.fields.length === 1 && match.fields[0] === 'content');

const hasRelatedBroadHeading = (queryTerms, headingPath) => {
  if (queryTerms.some((term) => ['digestion', 'digestive', 'digest'].includes(term))) {
    return includesAny(headingPath, ['digestive', 'digestion', 'nutrition']);
  }
  if (queryTerms.includes('nutrition')) return headingPath.includes('nutrition');
  if (queryTerms.includes('blood')) return includesAny(headingPath, ['blood', 'circulation', 'circulatory', 'transport']);
  return tokenIncludesAny(headingPath, queryTerms);
};

// Matches on whole-word token membership, not substring — a query term only counts as
// "found in the heading" if it appears as an actual word there, not merely as letters
// hiding inside a longer, unrelated word (see tokenize() above for why this can't just
// be a \b regex).
const scoreTermMatch = (term, { leafHeadingTokens, headingPathTokens, chapterTitleTokens, contentTokens }) => {
  let boost = 0;
  const matchedFields = [];

  if (leafHeadingTokens.has(term)) { boost += HEADING_TERM_BOOST; matchedFields.push('heading_path'); }
  else if (headingPathTokens.has(term)) { boost += PARENT_HEADING_TERM_BOOST; matchedFields.push('heading_path'); }
  if (chapterTitleTokens.has(term)) { boost += CHAPTER_TERM_BOOST; matchedFields.push('chapter_title'); }
  if (contentTokens.has(term)) { boost += CONTENT_TERM_BOOST; matchedFields.push('content'); }

  return { boost, matchedFields };
};

const calculateKeywordSignals = (queryTerms, result) => {
  const metadata = result.metadata || {};
  const searchableFields = {
    headingPath: normalizeText(metadata.heading_path),
    chapterTitle: normalizeText(metadata.chapter_title),
    content: normalizeText(`${result.content} ${metadata.originalText || ''}`),
  };
  const tokenFields = {
    leafHeadingTokens: tokenize(getLeafHeading(searchableFields.headingPath)),
    headingPathTokens: tokenize(searchableFields.headingPath),
    chapterTitleTokens: tokenize(searchableFields.chapterTitle),
    contentTokens: tokenize(searchableFields.content),
  };

  let keywordBoost = 0;
  const matchedTerms = [];

  for (const term of queryTerms) {
    const termMatch = scoreTermMatch(term, tokenFields);
    if (termMatch.boost > 0) {
      keywordBoost += termMatch.boost;
      matchedTerms.push({ term, fields: termMatch.matchedFields });
    }
  }

  return { keywordBoost, matchedTerms, searchableFields };
};

const calculateOverviewBoost = (intent, queryTerms, metadata, matchedTerms, searchableFields) => {
  if (!intent.isDefinitionOrExplanation) return 0;
  const headingPath = searchableFields.headingPath;
  const contentType = normalizeText(metadata.content_type);
  const headingDepth = getHeadingParts(metadata.heading_path).length;
  const headingMatchesQuery = hasHeadingTermMatch(matchedTerms);
  const relatedBroadHeading = hasRelatedBroadHeading(queryTerms, headingPath);
  let boost = 0;
  if (headingMatchesQuery && (
    includesAny(headingPath, ['overview', 'important definitions', 'summary', 'introduction']) ||
    includesAny(contentType, ['overview', 'definition', 'summary', 'introduction'])
  )) { boost += OVERVIEW_INTENT_BOOST; }
  if (headingDepth > 0 && headingDepth <= 2 && (headingMatchesQuery || relatedBroadHeading)) {
    boost += MAIN_HEADING_INTENT_BOOST;
  }
  return boost;
};

const calculateFunctionBoost = (intent, queryTerms, matchedTerms, searchableFields) => {
  if (!intent.isFunction) return 0;
  const headingPath = searchableFields.headingPath;
  const hasQueryTermInHeading = hasHeadingTermMatch(matchedTerms);
  const hasAnyQueryTermMatch = matchedTerms.length > 0;
  let boost = 0;
  if (hasQueryTermInHeading && includesAny(headingPath, ['function', 'role', 'importance'])) boost += DIRECT_FUNCTION_INTENT_BOOST;
  if (hasAnyQueryTermMatch && includesAny(headingPath, ['transport', 'circulation', 'blood'])) boost += DIRECT_FUNCTION_INTENT_BOOST;
  if (hasQueryTermInHeading && tokenIncludesAny(headingPath, queryTerms)) boost += RELATED_FUNCTION_INTENT_BOOST;
  return boost;
};

const calculateIntentBoost = ({ intent, queryTerms, result, matchedTerms, searchableFields }) => {
  const metadata = result.metadata || {};
  if (matchedTerms.length === 0) return 0;
  return (
    calculateOverviewBoost(intent, queryTerms, metadata, matchedTerms, searchableFields) +
    calculateFunctionBoost(intent, queryTerms, matchedTerms, searchableFields)
  );
};

const calculatePenalty = ({ intent, result, matchedTerms, searchableFields }) => {
  const metadata = result.metadata || {};
  const headingPath = searchableFields.headingPath;
  const contentType = normalizeText(metadata.content_type);
  let penalty = 0;
  if (includesAny(headingPath, ['short answer questions', 'long answer questions']) && !hasHeadingTermMatch(matchedTerms)) {
    penalty += QA_WITHOUT_HEADING_MATCH_PENALTY;
  }
  if (hasOnlyContentMatches(matchedTerms) && !hasChapterTermMatch(matchedTerms)) {
    penalty += CONTENT_ONLY_MATCH_PENALTY;
  }
  if (intent.isDefinitionOrExplanation && !intent.asksForActivity &&
    (headingPath.includes('activity') || contentType.includes('activity'))) {
    penalty += ACTIVITY_DEFINITION_PENALTY;
  }
  if (intent.isFunction && includesAny(headingPath, ['flowchart', 'flowcharts', 'path of', 'important equations'])) {
    penalty += FLOWCHART_FUNCTION_PENALTY;
  }
  return penalty;
};

const applyDiversityPenalty = (rankedResults) => {
  const parentCounts = new Map();
  return rankedResults.map((result) => {
    const headingParts = getHeadingParts(result.metadata?.heading_path);
    if (headingParts.length <= 2) return result;
    const parentHeading = getImmediateParentHeading(result.metadata?.heading_path);
    const currentCount = parentCounts.get(parentHeading) || 0;
    parentCounts.set(parentHeading, currentCount + 1);
    if (currentCount < 2) return result;
    return {
      ...result,
      finalScore: result.finalScore - DIVERSITY_PENALTY,
      rerankDebug: { ...result.rerankDebug, diversityPenalty: DIVERSITY_PENALTY },
    };
  });
};

/**
 * Reranks RAG results using keyword signals, intent boosts, and diversity penalty.
 *
 * @param {string} query   - The student's question (used to extract search terms)
 * @param {Array}  results - Raw results from vector similarity search
 * @returns {Array}        - Sorted results with finalScore field added
 */
export const rerankResults = (query, results) => {
  const queryTerms = extractQueryTerms(query);
  const detectedIntent = detectQueryIntent(query);

  const scoredResults = results.map((result) => {
    const { keywordBoost, matchedTerms, searchableFields } = calculateKeywordSignals(queryTerms, result);
    const intentBoost = calculateIntentBoost({ intent: detectedIntent, queryTerms, result, matchedTerms, searchableFields });
    const penalty = calculatePenalty({ intent: detectedIntent, result, matchedTerms, searchableFields });
    const finalScore = result.score + keywordBoost + intentBoost - penalty;

    return {
      ...result,
      finalScore,
      rerankDebug: {
        vectorScore: result.score,
        keywordBoost,
        intentBoost,
        diversityPenalty: 0,
        matchedTerms,
        detectedIntent: detectedIntent.label,
      },
    };
  });

  const firstPassRanked = scoredResults.sort((left, right) => right.finalScore - left.finalScore);
  return applyDiversityPenalty(firstPassRanked).sort((left, right) => right.finalScore - left.finalScore);
};
