import 'dotenv/config';

import { generateRagAnswer } from '../src/rag/query/answer/answerService.js';

const testQuestions = [
  'blood ka function kya hai?',
  'photosynthesis kya hai?',
  'placenta ka function kya hai?',
  'human digestion explain karo',
  'asexual reproduction kya hota hai?',
  'arteries ka function kya hai?',
];

const run = async () => {
  console.log('RAG answer generation test');
  console.log('==========================');

  for (const question of testQuestions) {
    const result = await generateRagAnswer(question);

    console.log('');
    console.log('----------------------------------------');
    console.log(`Question: ${result.question}`);
    console.log(`Candidates before rerank: ${result.retrieval.debug?.candidateCountBeforeRerank ?? 'Unknown'}`);
    console.log(`Candidates after minScore: ${result.retrieval.debug?.countAfterMinScore ?? 'Unknown'}`);
    console.log(`Eligible after final filtering: ${result.retrieval.debug?.countAfterFinalFiltering ?? 'Unknown'}`);
    console.log(`Final returned chunks: ${result.retrieval.results.length}`);
    console.log(`Generation mode: ${result.generationMode}`);
    if (result.modelError) {
      console.log(`Model note: ${result.modelError}`);
    }
    console.log('');
    console.log(result.answerWithSources);
  }
};

run().catch((error) => {
  console.error(`RAG answer test failed: ${error.message}`);
  process.exitCode = 1;
});
