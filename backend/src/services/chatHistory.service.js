import { ChatHistory } from '../models/chatHistory.model.js';
import { updateChatSessionLastMessageTime } from './chatSession.service.js';

/**
 * Appends messages to the session's history document.
 * Keeps only the last 30 messages, capped by MongoDB in the same update.
 */
export const addChatMessages = async (sessionId, messages = [], userId = null) => {
  if (!messages.length) {
    return [];
  }

  const formattedMessages = messages.map((msg) => ({
    role: msg.role,
    text: msg.text,
    action: msg.action || null,
    sources: msg.sources || [],
    metadata: msg.metadata || {},
    createdAt: new Date()
  }));

  // Upsert the session's history doc, push the new messages, and keep only the last 30
  const historyDoc = await ChatHistory.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: { userId },
      $push: {
        messages: {
          $each: formattedMessages,
          $slice: -30 // Keep only the last 30 messages
        }
      }
    },
    {
      upsert: true,
      returnDocument: 'after',
    }
  ).lean();

  // Update the parent session's lastMessageAt timestamp
  await updateChatSessionLastMessageTime(sessionId);

  return historyDoc?.messages || [];
};

/**
 * Convenience wrapper for single message pushes
 */
export const addChatMessage = async ({ sessionId, role, text, action = null, sources = [], metadata = {} }) => {
  return addChatMessages(sessionId, [{ role, text, action, sources, metadata }]);
};

/**
 * Returns the last `limit` messages for a session (default 50).
 */
export const getChatHistory = async (sessionId, limit = 50) => {
  const history = await ChatHistory.findOne({ sessionId }, { messages: { $slice: -limit } }).lean();
  return history ? history.messages : [];
};

export const deleteSessionHistory = async (sessionId) => {
  return ChatHistory.deleteOne({ sessionId });
};

/**
 * Returns the most recent `limit` messages (default 14) for the Ask prompt context.
 */
export const getRecentChatHistory = async (sessionId, limit = 14) => {
  // Messages are stored in order, so a negative $slice fetches the last N.
  const history = await ChatHistory.findOne({ sessionId }, { messages: { $slice: -limit } }).lean();
  return history ? history.messages : [];
};
