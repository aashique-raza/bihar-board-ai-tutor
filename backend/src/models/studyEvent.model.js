import mongoose from 'mongoose';

const studyEventSchema = new mongoose.Schema(
  {
    userId:    { type: String, default: null, index: true },
    guestId:   { type: String, default: null },
    sessionId: { type: String, required: true },
    chapterId: { type: String, required: true },
    topicId:   { type: String, default: null },

    eventType: {
      type: String,
      required: true,
      enum: [
        'chapter_started',       // first time student enters this chapter
        'chapter_resumed',       // student returns to a previously started chapter
        'chapter_completed',     // all core topics done via NEXT_STEP
        'chapter_restarted',     // student chose "start over"
        'topic_started',         // NEXT_STEP advances to a new topic
        'topic_completed',       // NEXT_STEP marks the previous topic as done
        'topic_skipped',         // student explicitly skips a topic (future)
        'doubt_asked',           // CONCEPT_QUESTION fired while in this chapter
        'explanation_requested', // EXPLAIN_MORE fired
        'session_started',       // new session begins for this chapter
        'session_exhausted',     // token limit hit during chapter study
      ],
    },

    // Event-specific extra data — keep flat, use sparingly
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    // YYYY-MM-DD UTC string — for streak calculation and time-bucketed analytics
    dayBucket: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'study_events',
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

// User's event timeline (most common read path for analytics)
studyEventSchema.index({ userId: 1, createdAt: -1 });

// Streak calculation: "did this user study on date X?"
studyEventSchema.index({ userId: 1, dayBucket: 1 });

// Chapter-level aggregate analytics
studyEventSchema.index({ chapterId: 1, eventType: 1 });

// NOTE: study_events is append-only — never update existing documents.
// Optional TTL (uncomment to auto-expire events older than 1 year):
// studyEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const StudyEvent =
  mongoose.models.StudyEvent ||
  mongoose.model('StudyEvent', studyEventSchema);
