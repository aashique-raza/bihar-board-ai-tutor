/**
 * cacheClient.js
 *
 * Redis connection for the two-layer cache (embedding + retrieval).
 * Redis is OPTIONAL — if REDIS_URL is missing or Redis goes down,
 * every operation silently falls through to in-memory only.
 * A student request will NEVER fail because of cache.
 *
 * Uses the same ioredis package already in package.json (installed for auth).
 */

import Redis from 'ioredis';

let client = null;
let initialized = false;

const getClient = () => {
  if (initialized) return client;
  initialized = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('[Cache] REDIS_URL not set — in-memory cache only (no cross-restart persistence)');
    return null;
  }

  client = new Redis(url, {
    // Reject commands immediately when disconnected — fail fast so try/catch handles it.
    // This prevents commands from piling up in an offline queue during Redis downtime.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    commandTimeout: 2000,
    // Give up retrying after 3 attempts to avoid blocking the request pipeline
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 800)),
  });

  client.on('connect', () => console.log('[Cache] Redis connected'));
  client.on('error', (e) => console.warn('[Cache] Redis error (non-fatal):', e.message));

  return client;
};

// --- Safe wrappers — these NEVER throw. Callers always get null on any failure. ---

export async function redisGet(key) {
  try {
    const c = getClient();
    return c ? await c.get(key) : null;
  } catch {
    return null;
  }
}

export async function redisSetex(key, ttlSeconds, value) {
  try {
    const c = getClient();
    if (c) await c.setex(key, ttlSeconds, value);
  } catch { /* non-fatal */ }
}

export async function redisSet(key, value) {
  try {
    const c = getClient();
    if (c) await c.set(key, value);
  } catch { /* non-fatal */ }
}

/**
 * Deletes all keys matching a glob pattern (e.g. 'zuno:retrieval:*').
 *
 * NOTE: Uses KEYS which is O(N) on total keyspace — blocks Redis for that duration.
 * For our scale (< 1000 retrieval keys on Upstash), this is fine.
 * Future: switch to SCAN-based iteration if keyspace grows beyond 10k.
 *
 * Deletes in batches of 100 to avoid spreading thousands of args to DEL (stack overflow risk).
 */
export async function redisDelPattern(pattern) {
  try {
    const c = getClient();
    if (!c) return;
    const keys = await c.keys(pattern);
    if (keys.length === 0) return;
    const BATCH = 100;
    for (let i = 0; i < keys.length; i += BATCH) {
      await c.del(...keys.slice(i, i + BATCH));
    }
  } catch { /* non-fatal */ }
}
