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
      lastRetrievalQuery: {
        type: String,
        default: null,
      },
      lastStudyResponse: {
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
      // Resets to 0 on any academic turn. Used for progressive redirect tiers (Phase 3).
      consecutiveNonAcademicTurns: {
        type: Number,
        default: 0,
      },
      // Never resets. Used for hard session-level non-academic cap (Phase 3).
      totalNonAcademicTurns: {
        type: Number,
        default: 0,
      },
      // Incremented by 1 per conversation turn (student Q + tutor A = 1 turn).
      // Used by P2-T3 to detect first turn for auto title generation.
      // Checked atomically via $inc — race-condition safe across concurrent tabs.
      messageCount: {
        type: Number,
        default: 0,
      },
    },
    // Saved on the very first student turn — used as sidebar preview when title is still 'New Chat'.
    // Never overwritten after first write (setFirstQuestionIfEmpty uses a null-filter guard).
    firstQuestion: {
      type: String,
      default: null,
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

/**
 * Returns a plain JS object with all chatState fields set to their schema defaults.
 * Derived directly from the schema — add a field with a default to the schema above
 * and this function automatically includes it. No manual sync needed.
 */
export const getDefaultChatState = () => {
  const doc = new ChatSession();
  return doc.chatState.toObject();
};
