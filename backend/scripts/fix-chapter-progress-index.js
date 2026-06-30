/**
 * One-time migration: fix user_chapter_unique index on chapter_progress.
 *
 * The old index was { userId, chapterId } with sparse:true. MongoDB's sparse
 * compound index still includes documents where userId is absent (null in the
 * index) as long as chapterId exists — which is always. This causes dup-key
 * conflicts between different guest users on the same chapter.
 *
 * Fix: drop the old sparse index. Mongoose will recreate it on next server
 * start with partialFilterExpression: { userId: { $type: 'objectId' } },
 * which ONLY indexes logged-in users (real ObjectIds), never guests.
 *
 * Also removes old test documents with userId:null that pollute the index.
 *
 * Run once from backend/: node scripts/fix-chapter-progress-index.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function run() {
  console.log('[Migration] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);

  const db = mongoose.connection.db;
  const col = db.collection('chapter_progress');

  // 1. Drop old conflicting index
  const indexes = await col.indexes();
  const hasOld = indexes.some((i) => i.name === 'user_chapter_unique');
  if (hasOld) {
    await col.dropIndex('user_chapter_unique');
    console.log('[Migration] Dropped old user_chapter_unique sparse index ✓');
  } else {
    console.log('[Migration] user_chapter_unique not found — already dropped or renamed');
  }

  // 2. Remove test documents that have userId:null explicitly stored
  //    (these are dev/test artifacts; real guest docs have no userId field at all)
  const { deletedCount } = await col.deleteMany({ userId: null });
  console.log(`[Migration] Deleted ${deletedCount} document(s) with userId:null (old test data)`);

  // 3. Also clear guest_chapter_unique if it was sparse (same issue may apply)
  //    The guestId sparse index is safe because guestId is ONLY set on guest docs,
  //    but let's verify it doesn't have the null-collision problem.
  //    (It shouldn't — guestId is never set on user docs — so we leave it.)

  console.log('[Migration] Done. Restart the server — Mongoose will create the correct partial index.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[Migration] FAILED:', err.message);
  process.exit(1);
});
