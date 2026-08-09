import mongoose from 'mongoose';

const servedQuestionSchema = new mongoose.Schema(
  {
    questionId:              { type: mongoose.Schema.Types.ObjectId, required: true }, // -> Question._id
    questionVersionSnapshot: { type: Number, required: true }, // Question.version at serve time
    options:                 [{ label: String, text: String }], // exact options sent to client, post-shuffle
    correctOptionLabel:      { type: String, required: true },  // authoritative correct label for THIS shuffle
    topicId:                 { type: String, default: null },   // Question.topicId snapshot at serve time
  },
  { _id: false }
);

const quizSessionSchema = new mongoose.Schema(
  {
    // ─── Identity ────────────────────────────────────────────────────────────
    userId:  { type: String, default: null, index: true },
    guestId: { type: String, default: null },

    // ─── Quiz scope ──────────────────────────────────────────────────────────
    quizType:   { type: String, enum: ['chapter_gate', 'chapter_practice', 'mix_practice'], required: true },
    subjectId:  { type: String, required: true },
    chapterId:  { type: String, default: null },
    chapterIds: { type: [String], default: [] },

    // ─── Served content ──────────────────────────────────────────────────────
    questions: { type: [servedQuestionSchema], required: true },

    // ─── Status ──────────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['pending', 'submitted', 'expired'],
      default: 'pending',
    },
    attemptId: { type: mongoose.Schema.Types.ObjectId, default: null }, // -> QuizAttempt._id, set after submit
    expiresAt: { type: Date, required: true }, // now + 30 min — TTL index deletes stale sessions
  },
  { timestamps: true, collection: 'quiz_sessions' }
);

// TTL: MongoDB auto-deletes expired sessions
quizSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const QuizSession =
  mongoose.models.QuizSession || mongoose.model('QuizSession', quizSessionSchema);
