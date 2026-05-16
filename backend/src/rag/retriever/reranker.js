const WEAK_QUERY_TERMS = new Set([
  'kya',
  'hai',
  'ka',
  'ki',
  'ke',
  'ko',
  'me',
  'mein',
  'in',
  'of',
  'and',
  'explain',
  'karo',
  'what',
  'is',
  'the',
  'function',
  'define',
  'human',
  'humans',
  'beings',
  'hota',
  'hoti',
  'hote',
]);

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
const DIVERSITY_PENALTY = 0.035;

const normalizeText = (text) =>
  String(text || '').toLowerCase();

const includesAny = (text, terms) =>
  terms.some((term) => text.includes(term));

const expandQueryTerm = (term) => {
  if (term === 'digestion' || term === 'digestive') {
    return ['digestion', 'digestive', 'digest'];
  }

  if (term === 'circulation' || term === 'circulatory') {
    return ['circulation', 'circulatory'];
  }

  return [term];
};

export const extractQueryTerms = (query) => {
  const terms = normalizeText(query).match(/[\p{L}\p{N}]+/gu) || [];
  const usefulTerms = terms.filter((term) =>
    term.length > 1 && !WEAK_QUERY_TERMS.has(term)
  );

  return [...new Set(usefulTerms.flatMap(expandQueryTerm))];
};

const detectQueryIntent = (query) => {
  const normalizedQuery = normalizeText(query);
  const isDefinitionOrExplanation = includesAny(normalizedQuery, [
    'kya hai',
    'hota hai',
    'explain',
    'define',
    'what is',
    'meaning',
  ]);
  const isFunction = includesAny(normalizedQuery, [
    'function',
    'ka function',
    'role',
    'work',
    'kaam',
  ]);
  const asksForActivity = includesAny(normalizedQuery, [
    'activity',
    'experiment',
    'practical',
  ]);

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
  String(headingPath || '')
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);

const getImmediateParentHeading = (headingPath) => {
  const parts = getHeadingParts(headingPath);

  if (parts.length <= 1) {
    return parts[0] || 'unknown';
  }

  return parts[parts.length - 2];
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
  matchedTerms.every((match) =>
    match.fields.length === 1 && match.fields[0] === 'content'
  );

const hasRelatedBroadHeading = (queryTerms, headingPath) => {
  if (queryTerms.some((term) => ['digestion', 'digestive', 'digest'].includes(term))) {
    return includesAny(headingPath, ['digestive', 'digestion', 'nutrition']);
  }

  if (queryTerms.includes('nutrition')) {
    return headingPath.includes('nutrition');
  }

  if (queryTerms.includes('blood')) {
    return includesAny(headingPath, ['blood', 'circulation', 'circulatory', 'transport']);
  }

  return includesAny(headingPath, queryTerms);
};

const scoreTermMatch = (term, { headingPath, chapterTitle, content }) => {
  let boost = 0;
  const matchedFields = [];
  const leafHeading = normalizeText(getLeafHeading(headingPath));

  if (leafHeading.includes(term)) {
    boost += HEADING_TERM_BOOST;
    matchedFields.push('heading_path');
  } else if (headingPath.includes(term)) {
    boost += PARENT_HEADING_TERM_BOOST;
    matchedFields.push('heading_path');
  }

  if (chapterTitle.includes(term)) {
    boost += CHAPTER_TERM_BOOST;
    matchedFields.push('chapter_title');
  }

  if (content.includes(term)) {
    boost += CONTENT_TERM_BOOST;
    matchedFields.push('content');
  }

  return {
    boost,
    matchedFields,
  };
};

const calculateKeywordSignals = (queryTerms, result) => {
  const metadata = result.metadata || {};
  const searchableFields = {
    headingPath: normalizeText(metadata.heading_path),
    chapterTitle: normalizeText(metadata.chapter_title),
    content: normalizeText(`${result.content} ${metadata.originalText || ''}`),
  };

  let keywordBoost = 0;
  const matchedTerms = [];

  for (const term of queryTerms) {
    const termMatch = scoreTermMatch(term, searchableFields);

    if (termMatch.boost > 0) {
      keywordBoost += termMatch.boost;
      matchedTerms.push({
        term,
        fields: termMatch.matchedFields,
      });
    }
  }

  return {
    keywordBoost,
    matchedTerms,
    searchableFields,
  };
};

const calculateOverviewBoost = (intent, queryTerms, metadata, matchedTerms, searchableFields) => {
  if (!intent.isDefinitionOrExplanation) {
    return 0;
  }

  const headingPath = searchableFields.headingPath;
  const contentType = normalizeText(metadata.content_type);
  const headingDepth = getHeadingParts(metadata.heading_path).length;
  const headingMatchesQuery = hasHeadingTermMatch(matchedTerms);
  const relatedBroadHeading = hasRelatedBroadHeading(queryTerms, headingPath);
  let boost = 0;

  if (headingMatchesQuery && (
    includesAny(headingPath, ['overview', 'important definitions', 'summary', 'introduction']) ||
    includesAny(contentType, ['overview', 'definition', 'summary', 'introduction'])
  )) {
    boost += OVERVIEW_INTENT_BOOST;
  }

  if (headingDepth > 0 && headingDepth <= 2 && (headingMatchesQuery || relatedBroadHeading)) {
    boost += MAIN_HEADING_INTENT_BOOST;
  }

  return boost;
};

const calculateFunctionBoost = (intent, queryTerms, matchedTerms, searchableFields) => {
  if (!intent.isFunction) {
    return 0;
  }

  const headingPath = searchableFields.headingPath;
  const hasQueryTermInHeading = hasHeadingTermMatch(matchedTerms);
  const hasAnyQueryTermMatch = matchedTerms.length > 0;
  let boost = 0;

  if (hasQueryTermInHeading && includesAny(headingPath, ['function', 'role', 'importance'])) {
    boost += DIRECT_FUNCTION_INTENT_BOOST;
  }

  if (hasAnyQueryTermMatch && includesAny(headingPath, ['transport', 'circulation', 'blood'])) {
    boost += DIRECT_FUNCTION_INTENT_BOOST;
  }

  if (hasQueryTermInHeading && includesAny(headingPath, queryTerms)) {
    boost += RELATED_FUNCTION_INTENT_BOOST;
  }

  return boost;
};

const calculateIntentBoost = ({ intent, queryTerms, result, matchedTerms, searchableFields }) => {
  const metadata = result.metadata || {};

  if (matchedTerms.length === 0) {
    return 0;
  }

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

  if (
    includesAny(headingPath, ['short answer questions', 'long answer questions']) &&
    !hasHeadingTermMatch(matchedTerms)
  ) {
    penalty += QA_WITHOUT_HEADING_MATCH_PENALTY;
  }

  if (hasOnlyContentMatches(matchedTerms) && !hasChapterTermMatch(matchedTerms)) {
    penalty += CONTENT_ONLY_MATCH_PENALTY;
  }

  if (
    intent.isDefinitionOrExplanation &&
    !intent.asksForActivity &&
    (headingPath.includes('activity') || contentType.includes('activity'))
  ) {
    penalty += ACTIVITY_DEFINITION_PENALTY;
  }

  return penalty;
};

const applyDiversityPenalty = (rankedResults) => {
  const parentCounts = new Map();

  return rankedResults.map((result) => {
    const headingParts = getHeadingParts(result.metadata?.heading_path);

    if (headingParts.length <= 2) {
      return result;
    }

    const parentHeading = getImmediateParentHeading(result.metadata?.heading_path);
    const currentCount = parentCounts.get(parentHeading) || 0;
    parentCounts.set(parentHeading, currentCount + 1);

    if (currentCount < 2) {
      return result;
    }

    const diversityPenalty = DIVERSITY_PENALTY;

    return {
      ...result,
      finalScore: result.finalScore - diversityPenalty,
      rerankDebug: {
        ...result.rerankDebug,
        diversityPenalty,
      },
    };
  });
};

export const rerankResults = (query, results) => {
  const queryTerms = extractQueryTerms(query);
  const detectedIntent = detectQueryIntent(query);
  const scoredResults = results.map((result) => {
    const { keywordBoost, matchedTerms, searchableFields } =
      calculateKeywordSignals(queryTerms, result);
    const intentBoost = calculateIntentBoost({
      intent: detectedIntent,
      queryTerms,
      result,
      matchedTerms,
      searchableFields,
    });
    const penalty = calculatePenalty({
      intent: detectedIntent,
      result,
      matchedTerms,
      searchableFields,
    });
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
  return applyDiversityPenalty(firstPassRanked)
    .sort((left, right) => right.finalScore - left.finalScore);
};
