import app from './app.js';
import { env, validateEnv } from './config/env.js';
import { connectDB, disconnectDB } from './db/mongooseClient.js';
import { Chunk } from './models/chunk.model.js';
import { connectRedis } from './config/redisClient.js';
import { connectMailer } from './auth/emailHelpers.js';

validateEnv();

let server;

try {
  await connectDB();

  // Verify MongoDB has chunks available for vector search.
  // If this throws, RAG cannot work at all — hard exit is correct.
  const totalVectors = await Chunk.countDocuments();
  console.log(`[Zuno] MongoDB vector chunks connected. Total chunks indexed: ${totalVectors}`);

  // connectMailer verifies the SMTP credentials are live.
  // In production this is fatal (broken email = broken registration).
  // In development we warn and continue so the API still works without email config.
  try {
    await connectMailer();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err; // re-throw so the outer catch exits the process
    }
    console.warn('[Mailer] SMTP connection failed — email features will not work:', err.message);
    console.warn('[Mailer] Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env to fix this.');
  }

  // Redis is required for auth (tokens, sessions). Fatal in production.
  // In development, warn and continue so non-auth features still work.
  try {
    await connectRedis();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Redis] Startup failed — exiting');
      process.exit(1);
    }
    console.warn('[Redis] Connection failed — auth features will not work:', err.code || err.message || err);
    console.warn('[Redis] Check REDIS_URL in .env and verify your Upstash instance is active.');
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
