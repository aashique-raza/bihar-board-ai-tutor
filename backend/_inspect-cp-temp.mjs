import 'dotenv/config';
import { connectDB, disconnectDB } from './src/db/mongooseClient.js';
import { ChapterProgress } from './src/models/chapterProgress.model.js';
import User from './src/models/user.model.js';

await connectDB();
const docs = await ChapterProgress.find({ chapterId: 'science.physics.chapter-01' }).lean();
console.log('Matching docs:', JSON.stringify(docs, null, 2));
const testUser = await User.findOne({ email: 'focus-mode-verify@zuno.internal' }).lean();
console.log('Test user _id:', testUser?._id?.toString());
await disconnectDB();
