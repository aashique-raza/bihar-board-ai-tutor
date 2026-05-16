import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';

import {
  createDocumentEmbeddings,
  EMBEDDING_PROVIDER,
  GEMINI_EMBEDDING_MODEL,
} from '../embeddings/langchainGeminiEmbeddings.js';
import { createMarkdownChunks } from '../chunkers/markdownChunker.js';
import { loadMarkdownDocuments } from '../loaders/markdownLoader.js';
import { saveLangChainMemoryVectorStore } from '../vector-store/langchainMemoryVectorStorePersistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..', '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');
const outputFilePath = path.resolve(backendRoot, 'storage', 'vector-store.json');

const getMetadataValue = (metadata, key, fallback = 'Unknown') => {
  const value = metadata?.[key];
  return value === undefined || value === null || value === '' ? fallback : value;
};

const buildLangChainPageContent = (chunk) => {
  const metadata = chunk.metadata || {};

  return `Bihar Board Class 10 Science
Section: ${getMetadataValue(metadata, 'section')}
Chapter: ${getMetadataValue(metadata, 'chapter_title')}
Topic/Heading: ${getMetadataValue(metadata, 'heading_path')}

Content:
${chunk.pageContent}`;
};

const createLangChainDocument = (chunk) =>
  new Document({
    id: chunk.id,
    pageContent: buildLangChainPageContent(chunk),
    metadata: {
      ...chunk.metadata,
      chunk_id: chunk.id,
      originalText: chunk.pageContent,
    },
  });

const runIndexPipeline = async () => {
  console.log('Starting RAG indexing pipeline...');
  console.log(`Source directory: ${baseDataDir}`);

  const documents = await loadMarkdownDocuments(baseDataDir);
  console.log(`Documents loaded: ${documents.length}`);

  const chunks = await createMarkdownChunks(documents);
  console.log(`Chunks generated: ${chunks.length}`);

  const langChainDocuments = chunks.map(createLangChainDocument);
  console.log(`LangChain documents prepared: ${langChainDocuments.length}`);
  console.log(`Embedding provider: ${EMBEDDING_PROVIDER}`);
  console.log(`Embedding model: ${GEMINI_EMBEDDING_MODEL}`);
  console.log('Vector store type: LangChain MemoryVectorStore');

  const embeddings = createDocumentEmbeddings();
  const vectorStore = await MemoryVectorStore.fromDocuments(langChainDocuments, embeddings);
  await saveLangChainMemoryVectorStore(vectorStore, outputFilePath, {
    provider: EMBEDDING_PROVIDER,
    embeddingModel: GEMINI_EMBEDDING_MODEL,
  });

  console.log(`Output file: ${outputFilePath}`);
  console.log(`Total vectors saved: ${vectorStore.memoryVectors.length}`);
  console.log('Indexing complete.');
};

runIndexPipeline().catch((error) => {
  console.error(`Indexing failed: ${error.message}`);
  process.exitCode = 1;
});
