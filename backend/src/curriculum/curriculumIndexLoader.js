/**
 * curriculumIndexLoader.js
 *
 * Runtime singleton loader for curriculum-index.json.
 *
 * This is NOT curriculumIndexStore.js — that file is for build scripts only
 * and includes validation logic. This file is intentionally minimal: load once,
 * cache in memory, return the parsed object.
 *
 * Usage:
 *   import { loadCurriculumIndex } from '../curriculum/curriculumIndexLoader.js';
 *   const index = await loadCurriculumIndex();
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// src/curriculum/ → backend root (2 levels up) → storage/curriculum-index.json
const CURRICULUM_INDEX_PATH = path.resolve(__dirname, '..', '..', 'storage', 'curriculum-index.json');

// In-memory cache — file is only read from disk once per server process
let cachedIndexPromise = null;

/**
 * Loads the curriculum index from disk and caches it.
 * All subsequent calls return the same cached promise.
 *
 * @returns {Promise<object>} The parsed curriculum index
 */
export const loadCurriculumIndex = () => {
  if (cachedIndexPromise !== null) {
    return cachedIndexPromise;
  }

  cachedIndexPromise = (async () => {
    let rawJson;

    try {
      rawJson = await fs.readFile(CURRICULUM_INDEX_PATH, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error('curriculum-index.json not found. Run: npm run curriculum:build');
      }
      throw new Error(`Unable to read curriculum-index.json: ${error.message}`);
    }

    try {
      return JSON.parse(rawJson);
    } catch (error) {
      throw new Error(`curriculum-index.json contains invalid JSON: ${error.message}`);
    }
  })();

  // If load fails, clear the cache so the next call retries
  cachedIndexPromise.catch(() => {
    cachedIndexPromise = null;
  });

  return cachedIndexPromise;
};
