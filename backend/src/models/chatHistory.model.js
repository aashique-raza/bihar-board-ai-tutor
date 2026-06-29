import mongoose from 'mongoose';

// Shape of one message inside the messages array
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
  // Action chips shown below this tutor message.
  // Persisted so chips are restored correctly on page refresh.
  suggestedActions: {
    type: [
      {
        type:  { type: String, maxlength: 60 },
        label: { type: String, maxlength: 80 },
        _id:   false,
      },
    ],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
}, { _id: false }); // No _id on sub-documents to keep the array compact

const chatHistorySchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true, // One history document per session
      index: true,
    },
    userId: {
      type: String,
      default: null,
      index: true, // For per-student analytics across sessions later
    },
    // All messages for this session, in order
    messages: [messageItemSchema]
  },
  {
    timestamps: true,
    collection: 'chat_history',
  }
);

export const ChatHistory =
  mongoose.models.ChatHistory || mongoose.model('ChatHistory', chatHistorySchema);
