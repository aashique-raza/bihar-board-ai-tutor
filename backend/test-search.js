import 'dotenv/config';
import mongoose from 'mongoose';
import { Chunk } from './src/models/chunk.model.js';
import { env } from './src/config/env.js';
import { createQueryEmbeddings } from './src/rag/geminiEmbeddings.js';

const testSearch = async () => {
  try {
    await mongoose.connect(env.mongodbUri);
    console.log('Connected to MongoDB');

    const embeddings = createQueryEmbeddings();
    console.log('Generating embedding for "photosynthesis"...');
    const queryEmbedding = await embeddings.embedQuery("photosynthesis");

    console.log('Running $vectorSearch...');
    const pipeline = [
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 10,
          limit: 5,
        }
      },
      {
        $project: {
          _id: 0,
          chunk_id: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ];

    const results = await Chunk.aggregate(pipeline);
    console.log(`Vector search returned ${results.length} results:`);
    results.forEach((r, i) => {
      console.log(`[${i+1}] ${r.chunk_id} | Score: ${r.score}`);
    });

  } catch (err) {
    console.error('Search error:', err);
  } finally {
    await mongoose.disconnect();
  }
};

testSearch();
