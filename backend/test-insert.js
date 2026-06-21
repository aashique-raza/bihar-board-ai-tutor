import 'dotenv/config';
import mongoose from 'mongoose';
import { Chunk } from './src/models/chunk.model.js';
import { env } from './src/config/env.js';

const test = async () => {
  try {
    await mongoose.connect(env.mongodbUri);
    const dummyEmbedding = Array(3072).fill(0.1); // 3072 dimensions

    const doc = new Chunk({
      chunk_id: 'test_123',
      pageContent: 'hello world',
      embedding: dummyEmbedding,
      metadata: { foo: 'bar' },
      chapterId: 'chap1'
    });

    console.log('Validating...');
    const err = doc.validateSync();
    if (err) console.error('Validation Error:', err.message);

    console.log('Inserting...');
    await Chunk.insertMany([doc], { ordered: false });
    
    const count = await Chunk.countDocuments();
    console.log('Count after insert:', count);
  } catch (err) {
    console.error('Caught error:', err.message);
  } finally {
    await Chunk.deleteMany({ chunk_id: 'test_123' });
    await mongoose.disconnect();
  }
};
test();
