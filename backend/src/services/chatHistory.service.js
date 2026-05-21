import { ChatHistory } from '../models/chatHistory.model.js';
import { updateChatSessionLastMessageTime } from './chatSession.service.js';

export const addChatMessage = async ({
  sessionId,
  role,
  text,
  action = null,
  sources = [],
  metadata = {},
}) => {
  const message = await ChatHistory.create({
    sessionId,
    role,
    text,
    action,
    sources,
    metadata,
  });

  await updateChatSessionLastMessageTime(sessionId);

  return message;
};

export const addChatMessages = async (sessionId, messages = []) => {
  if (!messages.length) {
    return [];
  }

  const savedMessages = await ChatHistory.insertMany(
    messages.map((message) => ({
      sessionId,
      role: message.role,
      text: message.text,
      action: message.action || null,
      sources: message.sources || [],
      metadata: message.metadata || {},
    }))
  );

  await updateChatSessionLastMessageTime(sessionId);

  return savedMessages;
};

export const getChatHistory = async (sessionId, limit = 50) => {
  return ChatHistory.find({ sessionId })
    .sort({ createdAt: 1 })
    .limit(limit);
};

export const getRecentChatHistory = async (sessionId, limit = 8) => {
  const messages = await ChatHistory.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return messages.reverse();
};
