import mongoose from 'mongoose';

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      default: null,
    },
    mode: {
      type: String,
      enum: ['guest', 'logged_in'],
      default: 'guest',
    },
    title: {
      type: String,
      default: 'New Chat',
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'chat_sessions',
  }
);

export const ChatSession =
  mongoose.models.ChatSession || mongoose.model('ChatSession', chatSessionSchema);

