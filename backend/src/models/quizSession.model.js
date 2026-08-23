import mongoose from 'mongoose';

const servedQuestionSchema = new mongoose.Schema(
  {
    questionId:      { type: mongoose.Schema.Types.ObjectId, required: true }, // -> Question._id
    questionVersion: { type: Number, required: true }, // Question.version at serve time
    // Original option labels ('A'-'D') in the order shown to the student, e.g. ['C','A','D','B'].
    // Deliberately labels-only, not the localized text — the client already has the 3-language
    // text from the response and can render any language without another server round trip.
    // Storing text here would also freeze it to whichever language was chosen at generate time.
    optionOrder:        { type: [String], required: true },
    correctOptionLabel: { type: String, required: true }, // display label ('A'-'D') correct for THIS shuffle
    topicId:             { type: String, default: null },  // Question.topicId snapshot at serve time
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
