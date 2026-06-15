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
      // Incremented by 1 per conversation turn (student Q + tutor A = 1 turn).
      // Used by P2-T3 to detect first turn for auto title generation.
      // Checked atomically via $inc — race-condition safe across concurrent tabs.
      messageCount: {
        type: Number,
        default: 0,
      },
    },
    // Set once at session creation via $setOnInsert — never overwritten.
    // Focus sessions remain Focus forever (SESSION_DESIGN.md constraint).
    sessionType: {
      type: String,
      enum: ['focus', 'global'],
      default: 'global',
    },
    // Accumulated across both LLM calls per turn (decider + tutor).
    // Wired to actual counts in P2-T4. Defaults to 0 until then.
    totalTokensUsed: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'chat_sessions',
  }
);

// Compound index for P2-T5 sessions list query: find by userId, sort by recency.
// Without this, MongoDB does a full collection scan — O(n) at any scale.
chatSessionSchema.index({ userId: 1, lastMessageAt: -1 });

export const ChatSession =
  mongoose.models.ChatSession || mongoose.model('ChatSession', chatSessionSchema);
