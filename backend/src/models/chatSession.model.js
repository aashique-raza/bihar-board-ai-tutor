import mongoose from 'mongoose';

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true, // Primary functional lock key from frontend
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
    // INTEGRATED: The State Machine Object Block
    chatState: {
      status: {
        type: String,
        enum: ['active', 'exhausted', 'blocked'],
        default: 'active', // Global firewall checker flag
      },
      learningMode: {
        type: String,
        enum: ['idle', 'lesson', 'doubt', 'quiz'],
        default: 'idle', // Context behavior anchor for Zuno
      },
      currentSubjectId: {
        type: String,
        default: null, // Scoping anchor for future expansion (Math, Science, etc.)
      },
      currentSectionId: {
        type: String,
        default: null, // Multi-branch tracking (Physics, Chemistry, Biology)
      },
      currentChapterId: {
        type: String,
        default: null, // Strict index identifier for vector storage cache hits
      },
      currentTopicId: {
        type: String,
        default: null, // Progression tracking pointer
      },
      abuseCount: {
        type: Number,
        default: 0, // Anti-spam automatic guard lock accumulator
      },
      answerLanguage: {
        type: String,
        default: 'hinglish', // Dynamic language script persistence lock
      },
      sessionTopicsProgress: {
        type: [String],
        default: [], // Memory footprint for summary feature without array bloat
      },
      completedTopicIds: {
        type: [String],
        default: [],
      },
      pendingAction: {
        type: mongoose.Schema.Types.Mixed,
        default: null, // Proposed vs Committed loop for subject changes
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