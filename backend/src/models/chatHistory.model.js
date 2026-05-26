import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true, // Blindingly fast queries using session UUID
    },
    userId: {
      type: String,
      default: null,
      index: true, // ADDED: Safe indexing for aggregate progress reporting per student
    },
    role: {
      type: String,
      enum: ['student', 'tutor'],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      default: null, // Stores transient system intents if needed
    },
    sources: {
      type: Array,
      default: [], // Ground truth reference links attached down the line
    },
    metadata: {
      type: Object,
      default: {}, // For future flags (e.g. bookmarks, topic categories)
    },
  },
  {
    timestamps: true,
    collection: 'chat_history',
  }
);

// SENIOR ARCHITECT HACK: Compound index matching for Step 2 historical data fetches.
// When Step 2 reads history, it queries by sessionId and sorts by chronological order.
chatMessageSchema.index({ sessionId: 1, createdAt: 1 });

export const ChatHistory =
  mongoose.models.ChatHistory || mongoose.model('ChatHistory', chatMessageSchema);