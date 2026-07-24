/**
 * fix-environment-chapters-section.js
 *
 * One-time migration. "Our Environment" and "Management of Natural Resources" were
 * mistakenly filed as Physics chapter_no 6/7 since this project's earliest content
 * pass — they are actually Biology chapters (NCERT original chapter 15/16), confirmed
 * against the official BSEB syllabus PDF. The content files were already moved to
 * data/class-10/science/biology/ (chapter_no 5/6) and re-indexed via
 * `npm run curriculum:build`. This script updates the matching EXISTING chunk
 * documents already in MongoDB so they agree with the moved files — same
 * metadata-only-migration pattern as backfill-chunk-topic-ids.js:
 *   - metadata.section: 'Physics' -> 'Biology'
 *   - metadata.chapter_no: 6->5, 7->6
 *   - metadata.chunk_id: recomputed to match the new section/chapter_no
 *   - pageContent: the "[Context] ... Section: Physics ..." header line shown to the
 *     tutor LLM is corrected to "Section: Biology" (everything after it is untouched)
 * `embedding` and `originalText` are NEVER touched — the underlying chapter text is
 * unchanged, only its classification, so no re-embedding / Gemini cost is needed.
 *
 * `metadata.topic_ids` is intentionally left as-is here — it will be recomputed
 * correctly by the next run of backfill-chunk-topic-ids.js (which matches by the
 * NEW chunk_id this script produces, against a fresh computation from the
 * already-moved .md files).
 *
 * Usage: node scripts/fix-environment-chapters-section.js
 */
import 'dotenv/config';

import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { Chunk } from '../src/models/chunk.model.js';
import { bumpRagVersion } from '../src/cache/retrievalCache.js';

const padNumber = (value, width) => String(value).padStart(width, '0');

// chapter_no 6 (Our Environment) -> biology chapter_no 5
// chapter_no 7 (Management of Natural Resources) -> biology chapter_no 6
const CHAPTER_NO_REMAP = { 6: 5, 7: 6 };

const run = async () => {
  await connectDB();

  const staleChunks = await Chunk.find({
    'metadata.section': 'Physics',
    'metadata.chapter_no': { $in: Object.keys(CHAPTER_NO_REMAP).map(Number) },
  });

  console.log(`Found ${staleChunks.length} chunk(s) tagged Physics chapter 6/7 (expected: 60, per the pre-implementation DB audit).`);

  if (staleChunks.length === 0) {
    console.log('Nothing to do — either already migrated, or the expected content is missing (investigate before re-running).');
    await disconnectDB();
    return;
  }

  let updated = 0;
  const byNewChunkId = new Map();

  for (const chunk of staleChunks) {
    const oldChapterNo = chunk.metadata.chapter_no;
    const newChapterNo = CHAPTER_NO_REMAP[oldChapterNo];
    const chunkIndex = chunk.metadata.chunk_index;
    const newChunkId = `biology-chapter-${padNumber(newChapterNo, 2)}-chunk-${padNumber(chunkIndex, 3)}`;

    // Guard against collisions before writing anything — a mismatch here means an
    // assumption above (e.g. chunk_index format) doesn't hold for this document.
    if (byNewChunkId.has(newChunkId)) {
      throw new Error(`Chunk ID collision computed for ${newChunkId} (from old chunk_id ${chunk.metadata.chunk_id}) — aborting before any write.`);
    }
    byNewChunkId.set(newChunkId, chunk.metadata.chunk_id);

    const oldHeaderLine = 'Section: Physics';
    const newHeaderLine = 'Section: Biology';
    if (!chunk.pageContent.includes(oldHeaderLine)) {
      throw new Error(`Expected "${oldHeaderLine}" in pageContent of ${chunk.metadata.chunk_id} but did not find it — aborting before any write.`);
    }
    const newPageContent = chunk.pageContent.replace(oldHeaderLine, newHeaderLine);

    // eslint-disable-next-line no-await-in-loop
    await Chunk.updateOne(
      { _id: chunk._id },
      {
        $set: {
          'metadata.section': 'Biology',
          'metadata.chapter_no': newChapterNo,
          'metadata.chunk_id': newChunkId,
          pageContent: newPageContent,
        },
      }
    );
    updated += 1;
  }

  console.log(`\nUpdated: ${updated}/${staleChunks.length}`);
  console.log('embedding and originalText were NOT touched on any document (no re-embedding needed).');

  await bumpRagVersion();
  console.log('RAG cache version bumped — stale cached retrieval results are invalidated.');

  await disconnectDB();
};

run().catch(async (err) => {
  console.error('[fix-environment-chapters-section] Failed:', err);
  try { await disconnectDB(); } catch {}
  process.exitCode = 1;
});
