import 'dotenv/config';
import mongoose from 'mongoose';
import { Chunk } from './src/models/chunk.model.js';
import { env } from './src/config/env.js';

const checkDB = async () => {
  try {
    await mongoose.connect(env.mongodbUri);
    const count = await Chunk.countDocuments();
    console.log(`\n\n--- DB CHECK ---`);
    console.log(`Total chunks in DB right now: ${count}`);
    
    if (count > 0) {
      const sample = await Chunk.findOne();
      console.log(`Sample chunk dimensions: ${sample.embedding.length}`);
    }
    console.log(`----------------\n\n`);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

checkDB();
