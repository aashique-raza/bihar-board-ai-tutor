/**
 * fix-guest-chapter-index.js
 *
 * One-time migration: drops the old `guest_chapter_unique` index (built with a
 * plain `sparse: true`, which incorrectly indexed documents where guestId was
 * explicitly stored as `null` — colliding across different logged-in users on
 * the same chapter) and lets Mongoose rebuild it from the model's new
 * partialFilterExpression definition (chapterProgress.model.js).
 *
 * Safe to run multiple times — if the old index is already gone, the drop is
 * a no-op and syncIndexes just confirms the correct index exists.
 *
 * Usage: node scripts/fix-guest-chapter-index.js
 */
import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChapterProgress } from '../src/models/chapterProgress.model.js';

const run = async () => {
  await connectDB();

  const before = await ChapterProgress.collection.indexes();
  console.log('Indexes before:', before.map((i) => `${i.name} ${JSON.stringify(i.key)} ${i.partialFilterExpression ? `partial:${JSON.stringify(i.partialFilterExpression)}` : i.sparse ? 'sparse' : ''}`));

  try {
    await ChapterProgress.collection.dropIndex('guest_chapter_unique');
    console.log('Dropped old guest_chapter_unique index.');
  } catch (err) {
    if (err.codeName === 'IndexNotFound') {
      console.log('guest_chapter_unique index did not exist — nothing to drop.');
    } else {
      throw err;
    }
  }

  const syncResult = await ChapterProgress.syncIndexes();
  console.log('syncIndexes result:', syncResult);

  const after = await ChapterProgress.collection.indexes();
  console.log('Indexes after:', after.map((i) => `${i.name} ${JSON.stringify(i.key)} ${i.partialFilterExpression ? `partial:${JSON.stringify(i.partialFilterExpression)}` : i.sparse ? 'sparse' : ''}`));

  await disconnectDB();
};

run().catch((err) => {
  console.error('[fix-guest-chapter-index] Failed:', err);
  process.exit(1);
});
