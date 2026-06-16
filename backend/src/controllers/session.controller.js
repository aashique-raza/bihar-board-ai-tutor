import { getChatHistory } from '../services/chatHistory.service.js';
import { findChatSession, getSessionsByUser } from '../services/chatSession.service.js';
import { sendResponse } from '../utils/sendResponse.js';
import ApiError from '../utils/ApiError.js';
import { env } from '../config/env.js';

export const getSessions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const rawSessions = await getSessionsByUser(userId, { limit: env.sessionsListLimit });

    const sessions = rawSessions.map((s) => ({
      sessionId: s.sessionId,
      title: s.title || 'New Chat',
      sessionType: s.sessionType || 'global',
      lastMessageAt: s.lastMessageAt,
      isLocked: s.chatState?.status === 'exhausted',
      messageCount: s.chatState?.messageCount || 0,
      currentChapterId: s.chatState?.currentChapterId || null,
    }));

    return sendResponse(res, 200, {
      message: 'Sessions fetched successfully.',
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};

export const getSessionHistory = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Ownership check — 404 for both "not found" and "not yours"
    // (never reveal that a sessionId belongs to someone else)
    const session = await findChatSession(sessionId);
    if (!session || session.userId !== userId) {
      return next(new ApiError(404, 'Session not found.'));
    }

    // Fetch messages only after ownership is verified
    const rawMessages = await getChatHistory(sessionId, 30);

    return sendResponse(res, 200, {
      message: 'Session history fetched successfully.',
      data: {
        sessionId,
        messages: rawMessages,
        sessionMeta: {
          title: session.title || 'New Chat',
          lastMessageAt: session.lastMessageAt,
          isLocked: session.chatState?.status === 'exhausted',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
