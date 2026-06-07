import app from './app.js';
import { env, validateEnv } from './config/env.js';
import { connectDB, disconnectDB } from './db/mongooseClient.js';

validateEnv();

let server;

try {
  await connectDB();

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
