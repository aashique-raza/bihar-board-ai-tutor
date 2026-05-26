import { randomUUID } from 'node:crypto';
import { ChatSession } from '../models/chatSession.model.js'; // Paths perfectly aligned to your config

export const createChatSession = async ({
  sessionId = randomUUID(),
  userId = null,
  mode = 'guest',
  title = 'New Chat',
} = {}) => {
  const session = await ChatSession.create({
    sessionId,
    userId,
    mode,
    title,
  });

  return session;
};

export const findChatSession = async (sessionId) => {
  return ChatSession.findOne({ sessionId });
};

export const getOrCreateChatSession = async (sessionId) => {
  return ChatSession.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: {
        sessionId,
        mode: 'guest',
        title: 'New Chat',
      },
    },
    {
      returnDocument: 'after',
      upsert: true,
    }
  );
};

export const updateChatSessionLastMessageTime = async (sessionId) => {
  return ChatSession.findOneAndUpdate(
    { sessionId },
    { lastMessageAt: new Date() },
    { returnDocument: 'after' }
  );
};

/**
 * NEW ARCHITECTURE ENGINE: Updates fields inside the nested chatState object safely
 * Uses MongoDB dot-notation ($set) to avoid overwriting or dropping other sibling state fields.
 */
export const updateChatSessionState = async (sessionId, updates) => {
  const updateFields = {};

  // Flat parameters ko atomic MongoDB dot-notation ($set) queries me dynamic map karna
  for (const [key, value] of Object.entries(updates)) {
    updateFields[`chatState.${key}`] = value;
  }

  return ChatSession.findOneAndUpdate(
    { sessionId },
    { $set: updateFields },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};