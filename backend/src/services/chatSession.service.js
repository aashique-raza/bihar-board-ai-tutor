import { randomUUID } from 'node:crypto';
import { ChatSession } from '../models/chatSession.model.js';

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
 * Updates fields inside the nested chatState object safely.
 * Uses MongoDB dot-notation ($set) so only the given fields change and the
 * other chatState fields are left untouched.
 */
export const updateChatSessionState = async (sessionId, updates) => {
  const updateFields = {};

  // Turn { key: value } into { 'chatState.key': value } for a dot-notation $set
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
