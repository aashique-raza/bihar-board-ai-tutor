/**
 * One-time migration: create the metadata.topic_ids index on the chunks collection.
 *
 * BUG-5 (STAGE1_DONE.md Section C): retrieveChunksByTopicId() runs
 *   Chunk.find({ 'metadata.topic_ids': topicId })
 * for the NEXT_STEP deterministic lookup. With no B-tree index on that path the
 * query is a full COLLSCAN on every "aage badhao" (verified via explain:
 * totalDocsExamined 629, totalKeysExamined 0). The metadata.topic_ids entry in
 * the Atlas "vector_index" is a $vectorSearch filter field only — a plain
 * .find() cannot use it.
 *
 * chunk.model.js now declares chunkSchema.index({ 'metadata.topic_ids': 1 }), so
 * Mongoose auto-creates it on the next server start / rag:index run. This script
 * makes that explicit and immediate for a deploy, matching the repo's
 * fix-*-index.js pattern. Idempotent — createIndex is a no-op if it exists.
 * The build runs in the background on Atlas (single-field multikey, tiny).
 *
 * indexPipeline.js does deleteMany + insertMany (never drops the collection), so
 * the index survives a re-index.
 *
 * Run once from backend/: node scripts/create-chunk-topic-id-index.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function run() {
  if (!MONGO_URI) throw new Error('MONGODB_URI (or MONGO_URI) is missing in .env');

  console.log('[Migration] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);

  const col = mongoose.connection.db.collection('chunks');

  const before = await col.indexes();
  console.log('[Migration] Existing indexes:', before.map((i) => i.name).join(', '));

  const name = await col.createIndex({ 'metadata.topic_ids': 1 });
  console.log(`[Migration] createIndex returned: ${name} ✓`);

  const after = await col.indexes();
  console.log('[Migration] Indexes now:', after.map((i) => i.name).join(', '));

  await mongoose.disconnect();
  console.log('[Migration] Done.');
}

run().catch((err) => {
  console.error('[Migration] FAILED:', err.message);
  process.exit(1);
});
