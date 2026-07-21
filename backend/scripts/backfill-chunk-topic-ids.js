/**
 * backfill-chunk-topic-ids.js
 *
 * One-time migration for the deterministic topic->chunk linking fix
 * (see RETRIEVAL_TOPIC_LINKING_PLAN.md). Computes topic_ids for every chapter's
 * chunks IN MEMORY (using the updated markdownChunker.js, no embedding calls),
 * then writes ONLY `metadata.topic_ids` onto the matching EXISTING chunk
 * document in MongoDB by chunk_id — embedding, pageContent, and every other
 * field are left untouched. No Gemini API cost, no re-embedding.
 *
 * Reports (does not silently proceed past) any chunk_id present in the fresh
 * computation but missing from the live DB, or vice versa — that would mean
 * the live store has drifted from the current .md files and this backfill
 * should not be trusted until investigated.
 *
 * Safe to re-run any time content changes and a full `npm run rag:index`
 * is not needed (topic_ids is pure metadata).
 *
 * Usage: node scripts/backfill-chunk-topic-ids.js
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { Chunk } from '../src/models/chunk.model.js';
import { loadMarkdownDocuments } from '../src/rag/markdownLoader.js';
import { createMarkdownChunks } from '../src/rag/markdownChunker.js';
import { bumpRagVersion } from '../src/cache/retrievalCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const baseDataDir = path.resolve(backendRoot, '..', 'data', 'class-10', 'science');

const run = async () => {
  await connectDB();

  console.log('Loading markdown documents and computing fresh chunks (in-memory, no embedding calls)...');
  const documents = await loadMarkdownDocuments(baseDataDir);
  const freshChunks = await createMarkdownChunks(documents);
  console.log(`Fresh chunks computed: ${freshChunks.length}`);

  const liveCount = await Chunk.countDocuments();
  console.log(`Live chunks in MongoDB: ${liveCount}`);

  let updated = 0;
  let withTopicIds = 0;
  const notFoundInLive = [];

  for (const chunk of freshChunks) {
    // eslint-disable-next-line no-await-in-loop
    const liveDoc = await Chunk.findOne({ chunk_id: chunk.id }, { _id: 1 });
    if (!liveDoc) {
      notFoundInLive.push(chunk.id);
      continue;
    }
    const topicIds = chunk.metadata.topic_ids || [];
    // eslint-disable-next-line no-await-in-loop
    await Chunk.updateOne({ _id: liveDoc._id }, { $set: { 'metadata.topic_ids': topicIds } });
    updated += 1;
    if (topicIds.length > 0) withTopicIds += 1;
  }

  const freshIds = new Set(freshChunks.map((c) => c.id));
  const allLiveIds = await Chunk.distinct('chunk_id');
  const orphanedInLive = allLiveIds.filter((id) => !freshIds.has(id));

  console.log(`\nUpdated: ${updated}/${freshChunks.length}`);
  console.log(`Chunks with 1+ topic_ids: ${withTopicIds}`);
  console.log(`Chunks with 0 topic_ids (expected for practice/reference/revision-only content): ${updated - withTopicIds}`);

  if (notFoundInLive.length > 0) {
    console.error(`\nWARNING — ${notFoundInLive.length} freshly-computed chunk_id(s) not found in live DB (content/DB drift — investigate before trusting this backfill):`);
    notFoundInLive.forEach((id) => console.error(`  ${id}`));
  }
  if (orphanedInLive.length > 0) {
    console.error(`\nWARNING — ${orphanedInLive.length} live chunk_id(s) not present in the fresh computation (stale data left in DB):`);
    orphanedInLive.forEach((id) => console.error(`  ${id}`));
  }
  if (notFoundInLive.length === 0 && orphanedInLive.length === 0) {
    console.log('\nNo drift — every live chunk_id matched a freshly-computed chunk 1:1.');
  }

  await bumpRagVersion();
  console.log('\nRAG cache version bumped — running servers will pick up fresh metadata within 5 minutes.');

  await disconnectDB();
};

run().catch(async (err) => {
  console.error('[backfill-chunk-topic-ids] Failed:', err);
  try { await disconnectDB(); } catch {}
  process.exitCode = 1;
});
