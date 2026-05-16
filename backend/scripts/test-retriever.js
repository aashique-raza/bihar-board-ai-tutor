import 'dotenv/config';

import { retrieveRelevantChunks } from '../src/rag/retriever/retriever.js';
import { retrieverConfig } from '../src/rag/retriever/retriever.config.js';

const testQuestions = [
  'blood ka function kya hai?',
  'photosynthesis kya hai?',
  'placenta ka function kya hai?',
  'human digestion explain karo',
  'asexual reproduction kya hota hai?',
  'nutrition in humans kya hai?',
  'arteries ka function kya hai?',
];

const formatScore = (score) => score.toFixed(4);

const createPreview = (text, maxLength = 220) => {
  const singleLine = String(text || '').replace(/\s+/g, ' ').trim();

  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return `${singleLine.slice(0, maxLength - 3)}...`;
};

const getTextPreview = (result) =>
  result.metadata?.originalText || result.content;

const formatMatchedTerms = (matchedTerms = []) => {
  if (matchedTerms.length === 0) {
    return 'None';
  }

  return matchedTerms
    .map((match) => `${match.term} (${match.fields.join(', ')})`)
    .join('; ');
};

const readNumberFromEnv = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const printResult = (result, index) => {
  const metadata = result.metadata || {};

  console.log(`Rank: ${index + 1}`);
  console.log(`Similarity score: ${formatScore(result.score)}`);
  console.log(`Final score: ${formatScore(result.finalScore ?? result.score)}`);
  console.log(`Detected intent: ${result.rerankDebug?.detectedIntent || 'Unknown'}`);
  console.log(`Keyword boost: ${formatScore(result.rerankDebug?.keywordBoost || 0)}`);
  console.log(`Intent boost: ${formatScore(result.rerankDebug?.intentBoost || 0)}`);
  console.log(`Diversity penalty: ${formatScore(result.rerankDebug?.diversityPenalty || 0)}`);
  console.log(`Matched terms: ${formatMatchedTerms(result.rerankDebug?.matchedTerms)}`);
  console.log(`Chapter title: ${metadata.chapter_title || 'Unknown'}`);
  console.log(`Section: ${metadata.section || 'Unknown'}`);
  console.log(`Heading path: ${metadata.heading_path || 'Unknown'}`);
  console.log(`Chunk id: ${metadata.chunk_id || result.id || 'Unknown'}`);
  console.log(`Preview: ${createPreview(getTextPreview(result))}`);
  console.log('');
};

const run = async () => {
  const topK = readNumberFromEnv('RETRIEVER_TOP_K', retrieverConfig.defaultTopK);
  const minScore = readNumberFromEnv('RETRIEVER_MIN_SCORE', retrieverConfig.defaultMinScore);

  console.log('Retriever inspection');
  console.log('====================');
  console.log(`topK: ${topK}`);
  console.log(`minScore: ${minScore}`);
  console.log('');

  for (const question of testQuestions) {
    const retrieval = await retrieveRelevantChunks(question, { topK, minScore });

    console.log('----------------------------------------');
    console.log(`Question: ${retrieval.question}`);
    console.log(`topK: ${retrieval.topK}`);
    console.log(`minScore: ${retrieval.minScore}`);
    console.log(`Total vectors loaded: ${retrieval.totalVectors}`);
    console.log(`Candidates before rerank: ${retrieval.debug?.candidateCountBeforeRerank ?? 'Unknown'}`);
    console.log(`After minScore: ${retrieval.debug?.countAfterMinScore ?? 'Unknown'}`);
    console.log(`After final filtering: ${retrieval.debug?.countAfterFinalFiltering ?? 'Unknown'}`);
    console.log(`Returned count: ${retrieval.debug?.returnedCount ?? retrieval.results.length}`);
    console.log(`Matched chunks: ${retrieval.results.length}`);
    console.log('');

    if (retrieval.results.length === 0) {
      console.log('No chunks met the minimum similarity score.');
      console.log('');
      continue;
    }

    retrieval.results.forEach(printResult);
  }
};

run().catch((error) => {
  console.error(`Retriever test failed: ${error.message}`);
  process.exitCode = 1;
});
