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
  let session = await findChatSession(sessionId);

  if (!session) {
    session = await createChatSession({ sessionId });
  }

  return session;
};

export const updateChatSessionLastMessageTime = async (sessionId) => {
  return ChatSession.findOneAndUpdate(
    { sessionId },
    { lastMessageAt: new Date() },
    { returnDocument: 'after' }
  );
};
