import { ChatState } from '../models/chatState.model.js';

export const createChatState = async (sessionId) => {
  return ChatState.create({ sessionId });
};

export const getChatState = async (sessionId) => {
  return ChatState.findOne({ sessionId });
};

export const getOrCreateChatState = async (sessionId) => {
  let state = await getChatState(sessionId);

  if (!state) {
    state = await createChatState(sessionId);
  }

  return state;
};

export const updateChatState = async (sessionId, updates) => {
  return ChatState.findOneAndUpdate(
    { sessionId },
    updates,
    {
      returnDocument: 'after',
      upsert: true,
    }
  );
};
