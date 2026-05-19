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

export const getChatHistory = async (sessionId, limit = 50) => {
  return ChatHistory.find({ sessionId })
    .sort({ createdAt: 1 })
    .limit(limit);
};

