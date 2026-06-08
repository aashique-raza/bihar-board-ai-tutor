import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      default: null, // null for Google users
    },

    authProvider: {
      type: String,
      enum: ['email', 'google'],
      required: true,
    },

    googleId: {
      type: String,
      default: null, // null for email users
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    role: {
      type: String,
      enum: ['student', 'admin'],
      default: 'student',
    },

    plan: {
      type: String,
      enum: ['free', 'pro'],
      default: 'free',
    },

    planExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // auto createdAt + updatedAt
  }
);

const User = mongoose.model('User', userSchema);

export default User;
