import mongoose from 'mongoose';

const chatHistorySchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
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
      default: null,
    },
    sources: {
      type: Array,
      default: [],
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'chat_history',
  }
);

export const ChatHistory =
  mongoose.models.ChatHistory || mongoose.model('ChatHistory', chatHistorySchema);

