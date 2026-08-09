import mongoose from 'mongoose';

const localizedTextSchema = {
  en:       { type: String, default: null },
  hi:       { type: String, default: null },
  hinglish: { type: String, default: null },
};

const optionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },              // 'A', 'B', 'C', 'D'
    text:  { type: localizedTextSchema, required: true },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    // ─── Identity ────────────────────────────────────────────────────────────
    questionCode: { type: String, required: true, unique: true }, // human-readable, used by seed script upsert matching
    subjectId:    { type: String, required: true, index: true },
    sectionId:    { type: String, default: null },
    chapterId:    { type: String, required: true, index: true },
    topicId:      { type: String, default: null, index: true }, // not yet populated in real data

    // ─── Content ─────────────────────────────────────────────────────────────
    questionText:      { type: localizedTextSchema, required: true },
    options:            { type: [optionSchema], required: true },
    correctOptionLabel: { type: String, required: true },       // one of options[].label
    explanation:        { type: localizedTextSchema, default: () => ({}) }, // not yet populated in real data

    // ─── Metadata ────────────────────────────────────────────────────────────
    difficulty:   { type: String, enum: ['easy', 'medium', 'hard'], default: null }, // not yet tagged in real data
    askedInYears: { type: [Number], default: [] }, // [2016, 2021] — PYQ tagging
    isActive:     { type: Boolean, default: true },
    version:      { type: Number, default: 1 }, // increment on content fix

    // ─── Authorship ──────────────────────────────────────────────────────────
    createdBy: { type: String, default: 'seed-script' },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, collection: 'question_bank' }
);

// Primary query index — all quiz generation queries use this
questionSchema.index({ subjectId: 1, chapterId: 1, isActive: 1 });
// Topic-level queries for weak-topic analysis + future dedup
questionSchema.index({ chapterId: 1, topicId: 1 });

export const Question =
  mongoose.models.Question || mongoose.model('Question', questionSchema);
