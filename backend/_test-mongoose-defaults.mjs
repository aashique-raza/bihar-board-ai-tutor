import 'dotenv/config';
import { connectDB, disconnectDB } from './src/db/mongooseClient.js';
import { ChapterProgress } from './src/models/chapterProgress.model.js';
import { upsertChapterProgress } from './src/services/chapterProgress.service.js';

await connectDB();

const fakeUserId = '000000000000000000000001'; // never used before, valid ObjectId-like string
const fakeChapterId = 'test.mongoose-defaults-probe.chapter-99';

// Clean slate
await ChapterProgress.deleteMany({ chapterId: fakeChapterId });

await upsertChapterProgress(fakeUserId, null, fakeChapterId, {
  currentTopicId: null,
  completedTopicIds: [],
  primarySessionId: 'probe-session',
  linkedSessionId: 'probe-session',
  subjectId: 'test',
  sectionId: 'test',
  chapterTitle: 'Probe',
});

// Raw check: does the actual stored document have a `guestId` key at all?
const raw = await ChapterProgress.collection.findOne({ chapterId: fakeChapterId });
console.log('Raw stored document:', JSON.stringify(raw, null, 2));
console.log('Does document have a "guestId" key at all?', Object.prototype.hasOwnProperty.call(raw, 'guestId'));
console.log('guestId value:', raw.guestId);

// Cleanup
await ChapterProgress.deleteMany({ chapterId: fakeChapterId });
await disconnectDB();
