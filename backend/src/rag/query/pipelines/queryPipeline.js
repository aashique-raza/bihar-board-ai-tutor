import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createQueryEmbeddings } from '../../indexing/embeddings/langchainGeminiEmbeddings.js';
import { loadLangChainMemoryVectorStore } from '../../indexing/vector-store/langchainMemoryVectorStorePersistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..', '..', '..');
const vectorStorePath = path.resolve(backendRoot, 'storage', 'vector-store.json');

const topK = 5;
const minScore = 0.55;

const formatScore = (score) => score.toFixed(4);
const createPreview = (text, maxLength = 280) => {
  const singleLine = String(text || '').replace(/\s+/g, ' ').trim();

  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return `${singleLine.slice(0, maxLength - 3)}...`;
};

const runQueryPipeline = async () => {
  const query = process.argv.slice(2).join(' ').trim();

  if (!query) {
    throw new Error('Please pass a query. Example: npm run rag:query -- "photosynthesis kya hota hai?"');
  }

  const embeddings = createQueryEmbeddings();
  const { vectorStore } = await loadLangChainMemoryVectorStore(vectorStorePath, embeddings);

  // LangChain embeds the query internally and performs MemoryVectorStore similarity search.
  const resultsWithScores = await vectorStore.similaritySearchWithScore(query, topK);
  const results = resultsWithScores.filter(([, score]) => score >= minScore);

  console.log('RAG retrieval results');
  console.log('=====================');
  console.log(`Query: ${query}`);
  console.log(`Total vectors loaded: ${vectorStore.memoryVectors.length}`);
  console.log(`topK: ${topK}`);
  console.log(`minScore: ${minScore}`);
  console.log('');

  if (results.length === 0) {
    console.log('No chunks met the minimum similarity score.');
    return;
  }

  for (const [index, [doc, score]] of results.entries()) {
    const metadata = doc.metadata || {};
    const previewText = metadata.originalText || doc.pageContent;

    console.log(`Result ${index + 1}`);
    console.log(`Similarity score: ${formatScore(score)}`);
    console.log(`Chunk ID: ${metadata.chunk_id || doc.id || 'Unknown'}`);
    console.log(`Section: ${metadata.section || 'Unknown'}`);
    console.log(`Chapter: ${metadata.chapter_title || 'Unknown'}`);
    console.log(`Topic/Heading: ${metadata.heading_path || 'Unknown'}`);
    console.log(`Source file: ${metadata.file_name || metadata.source_path || 'Unknown'}`);
    console.log(`Preview: ${createPreview(previewText)}`);
    console.log('');
  }
};

runQueryPipeline().catch((error) => {
  console.error(`Query failed: ${error.message}`);
  process.exitCode = 1;
});
