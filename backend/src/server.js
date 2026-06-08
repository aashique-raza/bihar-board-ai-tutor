import app from './app.js';
import { env, validateEnv } from './config/env.js';
import { connectDB, disconnectDB } from './db/mongooseClient.js';
import { loadRetrieverVectorStore } from './rag/retriever.js';
import { connectRedis } from './config/redisClient.js';

validateEnv();

let server;

try {
  await connectDB();

  // Pre-warm vector store so the first student request is not slow.
  // Failure here means RAG cannot work at all — hard exit is correct.
  const { totalVectors, embeddingDimension } = await loadRetrieverVectorStore();
  console.log(`[Zuno] Vector store pre-warmed: ${totalVectors} vectors (${embeddingDimension}-dim)`);

  try {
    await connectRedis();
  } catch (err) {
    console.error('[Redis] Startup failed — exiting');
    process.exit(1);
  }

  server = app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
} catch (error) {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
}

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down server.`);

  const exit = async () => {
    await disconnectDB();
    process.exit(0);
  };

  if (server) {
    server.close(exit);
    return;
  }

  await exit();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
