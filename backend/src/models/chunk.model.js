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

export const Chunk = mongoose.model('Chunk', chunkSchema);
