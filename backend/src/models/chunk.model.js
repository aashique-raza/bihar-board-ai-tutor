import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema({
  chunk_id: {
    type: String,
    required: true,
    unique: true,
  },
  pageContent: {
    type: String,
    required: true,
  },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: function(v) {
        // Validate Gemini embeddings length (gemini-embedding-001 uses 3072 dimensions)
        return v.length === 3072;
      },
      message: 'Embedding must have exactly 3072 dimensions.',
    },
  },
  chapterId: {
    type: String,
    index: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
}, {
  timestamps: true,
});

// BUG-5: retrieveChunksByTopicId() does a plain Chunk.find({ 'metadata.topic_ids': id })
// for the NEXT_STEP deterministic lookup. Without this index that is a full COLLSCAN
// on every "aage badhao" (the metadata.topic_ids entry in the Atlas "vector_index" is
// a $vectorSearch filter field only — a plain .find() cannot use it). Multikey index:
// topic_ids is an array, so one key per linked topic id.
chunkSchema.index({ 'metadata.topic_ids': 1 });

export const Chunk = mongoose.model('Chunk', chunkSchema);
