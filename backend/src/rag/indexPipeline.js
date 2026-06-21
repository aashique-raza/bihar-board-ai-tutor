/**
 * indexPipeline.js
 *
 * The RAG indexing pipeline — run via: npm run rag:index
 *
 * WHAT IT DOES (in order):
 *   1. Connects to MongoDB Atlas
 *   2. Load all Markdown study files from the data directory
 *   3. Split each file into chunks using the markdown chunker
 *   4. Clear existing chunks in MongoDB
 *   5. Batch generate embeddings using Google Gemini (to prevent API limits)
 *   6. Insert chunks into MongoDB
 *
 * Run this script whenever study content changes.
 * This file is NOT part of the runtime server — it runs offline only.
 */

import 'dotenv/config';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document } from '@langchain/core/documents';

import {
  createDocumentEmbeddings,
  EMBEDDING_PROVIDER,
  GEMINI_EMBEDDING_MODEL,
} from './geminiEmbeddings.js';
import { createMarkdownChunks } from './markdownChunker.js';
import { loadMarkdownDocuments } from './markdownLoader.js';

import { connectDB, disconnectDB } from '../db/mongooseClient.js';
import { Chunk } from '../models/chunk.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// src/rag/ → backend root (2 levels up)
const backendRoot = path.resolve(__dirname, '..', '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');

const getMetadataValue = (metadata, key, fallback = 'Unknown') => {
  const value = metadata?.[key];
  return value === undefined || value === null || value === '' ? fallback : value;
};

// Each chunk's page content includes a structured header so the LLM has full context
const buildLangChainPageContent = (chunk) => {
  const metadata = chunk.metadata || {};
  return `Bihar Board Class 10 ${getMetadataValue(metadata, 'subject')}
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

  // 1. Connect to MongoDB
  await connectDB();

  const documents = await loadMarkdownDocuments(baseDataDir);
  console.log(`Documents loaded: ${documents.length}`);

  const chunks = await createMarkdownChunks(documents);
  console.log(`Chunks generated: ${chunks.length}`);

  const langChainDocuments = chunks.map(createLangChainDocument);
  console.log(`LangChain documents prepared: ${langChainDocuments.length}`);
  console.log(`Embedding provider: ${EMBEDDING_PROVIDER}`);
  console.log(`Embedding model: ${GEMINI_EMBEDDING_MODEL}`);

  // 2. Clear old chunks
  console.log('Clearing old chunks from MongoDB...');
  await Chunk.deleteMany({});
  console.log('Old chunks deleted.');

  // 3. Batch processing for embeddings
  const embeddings = createDocumentEmbeddings();
  const BATCH_SIZE = 25;
  
  console.log(`Starting batch embedding and insertion (Batch size: ${BATCH_SIZE})...`);
  
  for (let i = 0; i < langChainDocuments.length; i += BATCH_SIZE) {
    const batch = langChainDocuments.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(langChainDocuments.length / BATCH_SIZE)}...`);
    
    const batchTexts = batch.map((doc) => doc.pageContent);
    
    try {
      // Generate embeddings for the batch
      const batchEmbeddings = await embeddings.embedDocuments(batchTexts);
      
      // Map to Mongoose documents
      const chunksToInsert = batch.map((doc, idx) => ({
        chunk_id: doc.metadata.chunk_id,
        pageContent: doc.pageContent,
        embedding: batchEmbeddings[idx],
        metadata: doc.metadata,
        chapterId: doc.metadata.chapter_id,
      }));
      
      // Insert into MongoDB
      await Chunk.insertMany(chunksToInsert, { ordered: false });
      
      if (i + BATCH_SIZE < langChainDocuments.length) {
         console.log('Sleeping 5s to avoid rate limits...');
         await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error(`Error processing batch: ${err.message}`);
      throw err;
    }
  }

  console.log(`Total vectors saved to MongoDB: ${langChainDocuments.length}`);
  console.log('Indexing complete.');
  
  // 4. Disconnect gracefully
  await disconnectDB();
};

runIndexPipeline().catch(async (error) => {
  console.error(`Indexing failed: ${error.message}`);
  try { await disconnectDB(); } catch (e) {}
  process.exitCode = 1;
});
