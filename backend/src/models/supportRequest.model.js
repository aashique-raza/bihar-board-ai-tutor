import mongoose from 'mongoose';

const supportRequestSchema = new mongoose.Schema(
  {
    // ─── Submission Content ──────────────────────────────────────────────────
    category:    { type: String, required: true },
    subject:     { type: String, required: true },
    description: { type: String, required: true },
    email:       { type: String, required: true },
    imageUrl:    { type: String, default: null }, // unused for now — reserved for future Cloudinary upload (profile page work)

    // ─── Identity (guest OR logged-in, never both) ──────────────────────────
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    guestId: { type: String, default: null },

    // ─── Optional Context ────────────────────────────────────────────────────
    sessionId: { type: String, default: null },

    // ─── Admin Tracking ──────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['open', 'resolved', 'closed'],
      default: 'open',
    },
    adminNotes: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'support_requests',
  }
);

// LIST path: admin dashboard — filter by status, most recent first
supportRequestSchema.index(
  { status: 1, createdAt: -1 },
  { name: 'status_recency' }
);

// LIST path: filter by category
supportRequestSchema.index(
  { category: 1, createdAt: -1 },
  { name: 'category_recency' }
);

export const SupportRequest =
  mongoose.models.SupportRequest ||
  mongoose.model('SupportRequest', supportRequestSchema);
