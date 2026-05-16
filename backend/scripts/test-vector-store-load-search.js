import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createQueryEmbeddings } from '../src/rag/embeddings/langchainGeminiEmbeddings.js';
import { loadLangChainMemoryVectorStore } from '../src/rag/vector-store/langchainMemoryVectorStorePersistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const vectorStorePath = path.resolve(backendRoot, 'storage', 'vector-store.json');

const queries = [
  'प्रकाश संश्लेषण क्या होता है?',
  'photosynthesis kya hota hai?',
  'acid base and salt kya hai?',
  'human heart ka function kya hai?',
  'electric current kya hota hai?',
];

const preview = (text, maxLength = 220) => {
  const singleLine = String(text || '').replace(/\s+/g, ' ').trim();
  return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength - 3)}...`;
};

const run = async () => {
  const embeddings = createQueryEmbeddings();
  const { vectorStore } = await loadLangChainMemoryVectorStore(vectorStorePath, embeddings);

  console.log('LangChain MemoryVectorStore load/search smoke test');
  console.log(`Total vectors loaded: ${vectorStore.memoryVectors.length}`);

  for (const query of queries) {
    const results = await vectorStore.similaritySearchWithScore(query, 5);

    console.log('');
    console.log(`Query: ${query}`);
    console.log(`Results: ${results.length}`);
    console.log(`Top scores: ${results.map(([, score]) => score.toFixed(4)).join(', ')}`);

    if (results.length === 0) {
      continue;
    }

    const [doc, score] = results[0];
    const metadata = doc.metadata || {};
    console.log(`Top score: ${score.toFixed(4)}`);
    console.log(`Top chunk_id: ${metadata.chunk_id || doc.id || 'Unknown'}`);
    console.log(`Section: ${metadata.section || 'Unknown'}`);
    console.log(`Chapter: ${metadata.chapter_title || 'Unknown'}`);
    console.log(`Heading: ${metadata.heading_path || 'Unknown'}`);
    console.log(`Source file: ${metadata.file_name || metadata.source_path || 'Unknown'}`);
    console.log(`Preview: ${preview(metadata.originalText || doc.pageContent)}`);
  }
};

run().catch((error) => {
  console.error(`Vector store load/search test failed: ${error.message}`);
  process.exitCode = 1;
});
