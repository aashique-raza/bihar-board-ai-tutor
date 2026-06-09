import mongoose from 'mongoose';

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true, // Unique session id sent by the frontend
    },
    userId: {
      type: String,
      default: null,
      index: true,
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
    // Per-session tutor state (the "memory" Zuno keeps between turns)
    chatState: {
      status: {
        type: String,
        enum: ['active', 'exhausted', 'blocked'],
        default: 'active', // Whether the session can still be used
      },
      learningMode: {
        type: String,
        enum: ['idle', 'lesson', 'doubt', 'quiz'],
        default: 'idle', // What the student is currently doing
      },
      currentSubjectId: {
        type: String,
        default: null, // Subject in focus (room to add Math etc. later)
      },
      currentSectionId: {
        type: String,
        default: null, // Section in focus (Physics, Chemistry, Biology)
      },
      currentChapterId: {
        type: String,
        default: null, // Chapter in focus
      },
      currentTopicId: {
        type: String,
        default: null, // Topic the student is on right now
      },
      abuseCount: {
        type: Number,
        default: 0, // Count of abusive/spam messages in this session
      },
      answerLanguage: {
        type: String,
        default: 'hinglish', // Language Zuno should answer in
      },
      sessionTopicsProgress: {
        type: [String],
        default: [], // Topics touched this session (used for summaries)
      },
      completedTopicIds: {
        type: [String],
        default: [],
      },
      pendingAction: {
        type: mongoose.Schema.Types.Mixed,
        default: null, // An action awaiting student confirmation (e.g. switch subject)
      },
      lastTopic: {
        type: String,
        default: null,
      },
      lastDoubtTopic: {
        type: String,
        default: null,
      },
      lastDoubtQuestion: {
        type: String,
        default: null,
      },
      consecutiveErrors: {
        type: Number,
        default: 0,
      },
      lastErrorAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
    collection: 'chat_sessions',
  }
);

export const ChatSession =
  mongoose.models.ChatSession || mongoose.model('ChatSession', chatSessionSchema);
