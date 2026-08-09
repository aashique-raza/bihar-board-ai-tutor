import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    questionId:              { type: mongoose.Schema.Types.ObjectId, required: true }, // -> Question._id
    questionVersionSnapshot: { type: Number, default: 1 },
    topicId:                 { type: String, default: null }, // Question.topicId snapshot at attempt time
    selectedOption:          { type: String, default: null }, // null = skipped/unanswered
    correctOptionLabel:      { type: String, required: true }, // the label that was correct FOR THIS ATTEMPT (post-shuffle)
    isCorrect:               { type: Boolean, required: true },
    timeSpentMs:             { type: Number, default: 0 }, // per-question timing
  },
  { _id: false }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    // ─── Identity ────────────────────────────────────────────────────────────
    userId:  { type: String, default: null, index: true },
    guestId: { type: String, default: null },

    // ─── Linkage ─────────────────────────────────────────────────────────────
    sessionId:      { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // -> QuizSession._id
    submissionKey:  { type: String, required: true, unique: true }, // client-generated UUID, prevents duplicate scoring on retry

    // ─── Quiz scope ──────────────────────────────────────────────────────────
    quizType:   { type: String, enum: ['chapter_gate', 'chapter_practice', 'mix_practice'], required: true },
    subjectId:  { type: String, required: true, index: true },
    chapterId:  { type: String, default: null },  // for chapter_gate and chapter_practice
    chapterIds: { type: [String], default: [] },  // for mix_practice

    // ─── Result ──────────────────────────────────────────────────────────────
    totalQuestions: { type: Number, required: true },
    score:          { type: Number, required: true },
    percentage:     { type: Number, required: true },
    answers:        { type: [answerSchema], required: true },
    timeTakenSec:   { type: Number, default: 0 }, // total quiz duration
  },
  { timestamps: true, collection: 'quiz_attempts' }
);

// History views (Quiz Hub attempt list), newest first
quizAttemptSchema.index({ userId: 1, quizType: 1, createdAt: -1 });

// Seen-question deprioritization queries by IDENTITY ONLY (no chapterId — mix_practice
// attempts have chapterId: null, so a narrower compound index wouldn't serve them).
quizAttemptSchema.index(
  { guestId: 1 },
  { partialFilterExpression: { guestId: { $type: 'string' } } }
);

export const QuizAttempt =
  mongoose.models.QuizAttempt || mongoose.model('QuizAttempt', quizAttemptSchema);
