// Redis singleton — one shared connection for the entire backend process
import Redis from 'ioredis';

// REDIS_URL is loaded from .env by env.js (imported before this module runs in server.js)
const REDIS_URL = process.env.REDIS_URL;

// Retry strategy — stop retrying after 3 attempts by returning null
const retryStrategy = (times) => {
  if (times >= 3) return null;
  return Math.min(times * 200, 2000);
};

// Create the singleton Redis instance with Upstash TLS config
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy,
});

// Connection lifecycle event handlers
redis.on('connect', () => console.log('[Redis] Connecting...'));
redis.on('ready', () => console.log('[Redis] Connected and ready'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));
redis.on('close', () => console.log('[Redis] Connection closed'));
redis.on('reconnecting', () => console.log('[Redis] Reconnecting...'));

// Ping check — called at server startup to verify the connection is live
export const connectRedis = async () => {
  try {
    await redis.ping();
    console.log('[Redis] Ping successful');
  } catch (err) {
    console.error('[Redis] Ping failed:', err.message);
    throw err;
  }
};

export default redis;
