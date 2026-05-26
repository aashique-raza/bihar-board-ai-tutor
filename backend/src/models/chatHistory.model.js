import mongoose from 'mongoose';

// Individual Message Structure inside the array
const messageItemSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now,
  }
}, { _id: false }); // sub-document key disable taaki array compact rahe

const chatHistorySchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true, // ABOLUTE LOCK: Pure session ka sirf EK document hoga
      index: true,
    },
    userId: {
      type: String,
      default: null,
      index: true, // For cross-session dynamic student analytics later
    },
    // The Core Memory Array
    messages: [messageItemSchema]
  },
  {
    timestamps: true,
    collection: 'chat_history',
  }
);

export const ChatHistory =
  mongoose.models.ChatHistory || mongoose.model('ChatHistory', chatHistorySchema);