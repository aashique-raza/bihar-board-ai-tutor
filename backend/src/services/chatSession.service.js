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

export const getOrCreateChatSession = async (sessionId, { sessionType = 'global', userId = null } = {}) => {
  return ChatSession.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: {
        sessionId,
        mode: userId ? 'logged_in' : 'guest',
        title: 'New Chat',
        sessionType, // immutable after first write
        userId,
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
 * Unified session update — handles chatState fields, top-level $inc, and
 * $setOnInsert of immutable fields (sessionType, userId, mode) in one atomic op.
 *
 * @param {string} sessionId
 * @param {object} ops
 * @param {object} ops.chatStateSet    - Fields to $set inside chatState (dot-notation added internally)
 * @param {object} ops.chatStateInc    - Fields to $inc inside chatState (e.g. { messageCount: 1 })
 * @param {object} ops.topLevelInc     - Top-level fields to $inc (e.g. { totalTokensUsed: 450 })
 * @param {object} meta
 * @param {string|null} meta.userId
 * @param {string} meta.sessionType    - 'focus' | 'global' — set once via $setOnInsert, never overwritten
 */
export const updateChatSession = async (
  sessionId,
  { chatStateSet = {}, chatStateInc = {}, topLevelInc = {} },
  { userId = null, sessionType = 'global' } = {}
) => {
  const setFields = {};
  const incFields = {};

  for (const [key, value] of Object.entries(chatStateSet)) {
    setFields[`chatState.${key}`] = value;
  }

  for (const [key, value] of Object.entries(chatStateInc)) {
    incFields[`chatState.${key}`] = value;
  }

  for (const [key, value] of Object.entries(topLevelInc)) {
    incFields[key] = value;
  }

  const update = {
    $setOnInsert: {
      userId,
      mode: userId ? 'logged_in' : 'guest',
      sessionType, // immutable — only applied on document creation
    },
  };

  if (Object.keys(setFields).length > 0) update.$set = setFields;
  if (Object.keys(incFields).length > 0) update.$inc = incFields;

  return ChatSession.findOneAndUpdate(
    { sessionId },
    update,
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

/**
 * P2-T3: Set session title only if it is still the default 'New Chat'.
 * The { title: 'New Chat' } filter makes this race-condition safe across
 * concurrent tabs — only the first writer succeeds; subsequent calls no-op.
 * Also protects user-renamed titles from being overwritten.
 */
export const setSessionTitleIfDefault = async (sessionId, title) => {
  return ChatSession.updateOne(
    { sessionId, title: 'New Chat' },
    { $set: { title } }
  );
};

/**
 * Updates fields inside the nested chatState object safely.
 * Uses MongoDB dot-notation ($set) so only the given fields change and the
 * other chatState fields are left untouched.
 */
export const updateChatSessionState = async (sessionId, updates, userId = null) => {
  const updateFields = {};

  // Turn { key: value } into { 'chatState.key': value } for a dot-notation $set
  for (const [key, value] of Object.entries(updates)) {
    updateFields[`chatState.${key}`] = value;
  }

  return ChatSession.findOneAndUpdate(
    { sessionId },
    {
      $set: updateFields,
      $setOnInsert: {
        userId,
        mode: userId ? 'logged_in' : 'guest',
      },
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};
