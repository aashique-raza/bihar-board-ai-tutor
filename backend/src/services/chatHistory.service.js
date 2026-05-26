import { ChatHistory } from '../models/chatHistory.model.js';
import { updateChatSessionLastMessageTime } from './chatSession.service.js';

/**
 * ATOMIC INGESTION ENGINE: Appends an array of messages into the session's history document.
 * Automatically caps history length to the last 30 messages inside the MongoDB layer!
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

  // Native NoSQL Magic: Upsert the container, push items, and slice array to retain only last 30 elements
  const historyDoc = await ChatHistory.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: { userId },
      $push: {
        messages: {
          $each: formattedMessages,
          $slice: -30 // Keeps only the last 30 operational turns atomically!
        }
      }
    },
    {
      upsert: true,
      returnDocument: 'after',
      lean: true
    }
  );

  // Sync timeline activity timestamp with parent session
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
 * Returns full historical array up to standard caps
 */
export const getChatHistory = async (sessionId, limit = 50) => {
  const history = await ChatHistory.findOne({ sessionId }, { messages: { $slice: -limit } }).lean();
  return history ? history.messages : [];
};

/**
 * FAST RETRIEVAL LAYER: Extracts the tail window array elements cleanly for the Ask flow prompt context.
 */
export const getRecentChatHistory = async (sessionId, limit = 14) => {
  // Directly projection slice from tail. Since it's stored in order, $slice negative fetches the last N elements.
  const history = await ChatHistory.findOne({ sessionId }, { messages: { $slice: -limit } }).lean();
  return history ? history.messages : [];
};