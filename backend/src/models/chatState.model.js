import mongoose from 'mongoose';

const chatStateSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    currentSubjectId: {
      type: String,
      default: null,
    },
    currentSectionId: {
      type: String,
      default: null,
    },
    currentChapterId: {
      type: String,
      default: null,
    },
    currentTopicId: {
      type: String,
      default: null,
    },
    learningMode: {
      type: String,
      enum: ['idle', 'lesson', 'doubt', 'revision'],
      default: 'idle',
    },
    preferredStudyMode: {
      type: String,
      enum: ['global', 'focus'],
      default: 'global',
    },
    pendingAction: {
      type: String,
      default: null,
    },
    completedTopicIds: {
      type: [String],
      default: [],
    },
    lastTutorAction: {
      type: String,
      default: null,
    },
    lastIntent: {
      type: String,
      default: null,
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
    lastDoubtSources: {
      type: Array,
      default: [],
    },
    lastStudentMessage: {
      type: String,
      default: null,
    },
    lastAnswer: {
      type: String,
      default: null,
    },
    lastSources: {
      type: Array,
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'chat_states',
  }
);

export const ChatState =
  mongoose.models.ChatState || mongoose.model('ChatState', chatStateSchema);
