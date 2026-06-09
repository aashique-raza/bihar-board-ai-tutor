// Redis singleton — one shared connection for the entire backend process
import Redis from 'ioredis';

// Same ESM initialization-order problem as emailHelpers: this module is loaded
// (as a dep of app.js → authController) before env.js runs dotenv.config().
// So we must NOT create the Redis instance at module level — process.env.REDIS_URL
// would be undefined and ioredis would silently connect to localhost:6379.
// Solution: lazy singleton created on first use via a Proxy.

const retryStrategy = (times) => {
  if (times >= 3) return null;
  return Math.min(times * 200, 2000);
};

let _instance = null;

const getInstance = () => {
  if (!_instance) {
    _instance = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy,
    });

    _instance.on('connect', () => console.log('[Redis] Connecting...'));
    _instance.on('ready', () => console.log('[Redis] Connected and ready'));
    _instance.on('error', (err) => console.error('[Redis] Error:', err.code || err.message || err));
    _instance.on('close', () => console.log('[Redis] Connection closed'));
    _instance.on('reconnecting', () => console.log('[Redis] Reconnecting...'));
  }
  return _instance;
};

// Ping check — called at server startup to verify the connection is live.
// This is also the first call that triggers the lazy Redis creation.
export const connectRedis = async () => {
  try {
    await getInstance().ping();
    console.log('[Redis] Ping successful');
  } catch (err) {
    console.error('[Redis] Ping failed:', err.code || err.message || err);
    throw err;
  }
};

// Proxy so all callers (redis.get, redis.set, redis.del, etc.) work without changes.
// Every property access is transparently forwarded to the lazily-created instance.
const redis = new Proxy({}, {
  get(_, prop) {
    return getInstance()[prop];
  },
});

export default redis;
