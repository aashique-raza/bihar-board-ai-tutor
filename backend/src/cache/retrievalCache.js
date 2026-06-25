/**
 * retrievalCache.js
 *
 * Two-layer cache for MongoDB Atlas Vector Search results (after reranking).
 *
 * WHY: Every CONCEPT_QUESTION hits MongoDB Atlas ($vectorSearch) — ~400-700ms network round-trip.
 * For the same query + same chapter filter, Atlas returns identical chunks every time
 * (until we rebuild the index with npm run rag:index).
 *
 * L1 (process memory): Map capped at 300 entries. Zero latency.
 * L2 (Redis): Persistent. ~3ms fetch. 24-hour TTL.
 *
 * CACHE INVALIDATION:
 * When `npm run rag:index` completes, it calls bumpRagVersion().
 * This stores a new version timestamp in Redis and deletes all retrieval cache keys.
 * The running server re-checks the version every 5 minutes — within that window,
 * it detects the new version, clears its own L1, and uses fresh Atlas data.
 *
 * Cache key: hash(normalizedQuery + metadataFilter + topK + requireTermMatch) + ragVersion
 */

import { normalizeQuery, hashString } from './cacheUtils.js';
import { redisGet, redisSetex, redisSet, redisDelPattern } from './cacheClient.js';

const isDev = process.env.NODE_ENV !== 'production';

const L1 = new Map();
const L1_MAX = 300;
const L2_TTL = 24 * 60 * 60; // 24 hours in seconds

const RAG_VERSION_REDIS_KEY = 'zuno:rag:version';

// Re-checked from Redis every 5 minutes so the server auto-detects when rag:index
// runs in a separate process and bumps the version — clears stale L1 automatically.
let _ragVersion = null;
let _ragVersionFetchedAt = 0;
const RAG_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const getRagVersion = async () => {
  const now = Date.now();
  if (_ragVersion && (now - _ragVersionFetchedAt) < RAG_VERSION_CHECK_INTERVAL_MS) {
    return _ragVersion;
  }

  const stored = await redisGet(RAG_VERSION_REDIS_KEY);
  const latest = stored || '1';
  _ragVersionFetchedAt = now;

  // Version changed externally (rag:index ran in a different process) → clear L1
  if (latest !== _ragVersion) {
    if (_ragVersion !== null) {
      L1.clear();
      console.log(`[RetrievalCache] RAG version changed (${_ragVersion} → ${latest}). L1 cleared.`);
    }
    _ragVersion = latest;
  }

  return _ragVersion;
};

/**
 * Call this at the END of a successful `npm run rag:index` run.
 * Clears L1, updates the version in Redis, and deletes all retrieval cache keys in Redis.
 */
export const bumpRagVersion = async () => {
  const nextVersion = String(Date.now());
  _ragVersion = nextVersion;
  _ragVersionFetchedAt = Date.now();
  L1.clear();
  await redisSet(RAG_VERSION_REDIS_KEY, nextVersion);
  await redisDelPattern('zuno:retrieval:*');
  console.log(`[RetrievalCache] RAG version bumped → ${nextVersion}. All retrieval cache cleared.`);
};

const buildKey = async (query, options) => {
  const { metadataFilter, topK, requireTermMatchForLatinQuery } = options;
  const normalizedQ = normalizeQuery(query);
  const optionsStr = JSON.stringify({
    f: metadataFilter || null,
    k: topK || 5,
    r: requireTermMatchForLatinQuery || false,
  });
  const hash = hashString(normalizedQ + optionsStr);
  const version = await getRagVersion();
  return `zuno:retrieval:v1:${hash}:${version}`;
};

const evictL1 = () => {
  const oldest = L1.keys().next().value;
  if (oldest !== undefined) L1.delete(oldest);
};

export const retrievalCache = {
  /**
   * Returns retrieval results for `query + options`, fetching from L1 → L2 → fetchFn.
   * fetchFn: async () => { results: [], debug: {}, ... }
   *
   * Empty results and corrupted cache entries are never cached — treated as misses.
   */
  async getOrFetch(query, options, fetchFn) {
    const t0 = Date.now();
    const key = await buildKey(query, options);

    // L1 check — zero latency, in-process memory
    if (L1.has(key)) {
      if (isDev) console.log(`[RetrievalCache] ✓ L1 HIT  (${Date.now() - t0}ms)  "${query.slice(0, 50)}"`);
      return L1.get(key);
    }

    // L2 check — Redis, ~3ms, persistent across restarts
    const cached = await redisGet(key);
    if (cached) {
      try {
        const result = JSON.parse(cached);
        // Validate: must have a results array (corrupted or wrong shape → treat as miss)
        if (result && Array.isArray(result.results)) {
          if (L1.size >= L1_MAX) evictL1();
          L1.set(key, result);
          if (isDev) console.log(`[RetrievalCache] ✓ L2 HIT  (${Date.now() - t0}ms Redis)  "${query.slice(0, 50)}"`);
          return result;
        }
        if (isDev) console.warn(`[RetrievalCache] Invalid shape in Redis for key ${key} — cache miss`);
      } catch {
        // JSON.parse failed — corrupted Redis entry, fall through to re-fetch
        if (isDev) console.warn(`[RetrievalCache] Corrupted Redis entry for key ${key} — cache miss`);
      }
    }

    // Cache miss — run the real Atlas vector search + rerank
    const atlasStart = Date.now();
    if (isDev) console.log(`[RetrievalCache] ✗ MISS — querying MongoDB Atlas: "${query.slice(0, 50)}"`);
    const result = await fetchFn();
    if (isDev) console.log(`[RetrievalCache]   Atlas done in ${Date.now() - atlasStart}ms  (${result.results?.length ?? 0} chunks)`);

    // Only cache non-empty results — empty could be a transient Atlas error
    if (Array.isArray(result.results) && result.results.length > 0) {
      if (L1.size >= L1_MAX) evictL1();
      L1.set(key, result);
      // Fire-and-forget Redis write — don't block the response
      redisSetex(key, L2_TTL, JSON.stringify(result)).catch(() => {});
    }

    return result;
  },

  getStats: () => ({ l1Size: L1.size, l1Max: L1_MAX }),
};
