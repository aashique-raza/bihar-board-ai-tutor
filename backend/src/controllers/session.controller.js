import { getChatHistory, deleteSessionHistory } from '../services/chatHistory.service.js';
import { findChatSession, getSessionsByUser, deleteSessionById, renameSessionById } from '../services/chatSession.service.js';
import { getChapterProgress } from '../services/chapterProgress.service.js';
import { sendResponse } from '../utils/sendResponse.js';
import ApiError from '../utils/ApiError.js';
import { env } from '../config/env.js';

export const getSessions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const rawSessions = await getSessionsByUser(userId, { limit: env.sessionsListLimit });

    const sessions = rawSessions.map((s) => {
      const title = s.title || 'New Chat';
      return {
        sessionId: s.sessionId,
        title,
        // Sidebar fallback: show first student question when title is still default
        previewText: title === 'New Chat' ? (s.firstQuestion || null) : null,
        sessionType: s.sessionType || 'global',
        lastMessageAt: s.lastMessageAt,
        isLocked: s.chatState?.status === 'exhausted',
        messageCount: s.chatState?.messageCount || 0,
        currentChapterId: s.chatState?.currentChapterId || null,
      };
    });

    return sendResponse(res, 200, {
      message: 'Sessions fetched successfully.',
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await findChatSession(sessionId);
    if (!session) return next(new ApiError(404, 'Session not found.'));
    if (session.userId !== userId) return next(new ApiError(404, 'Session not found.'));

    // Delete session and its history in parallel
    await Promise.all([
      deleteSessionById(sessionId),
      deleteSessionHistory(sessionId),
    ]);

    return sendResponse(res, 200, { message: 'Session deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

export const renameSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const { title } = req.body;

    if (!title || !String(title).trim()) {
      return next(new ApiError(400, 'Title is required.'));
    }

    const session = await findChatSession(sessionId);
    if (!session) return next(new ApiError(404, 'Session not found.'));
    if (session.userId !== userId) return next(new ApiError(404, 'Session not found.'));

    const updated = await renameSessionById(sessionId, title);

    return sendResponse(res, 200, {
      message: 'Session renamed successfully.',
      data: { sessionId, title: updated.title },
    });
  } catch (error) {
    next(error);
  }
};

export const getSessionHistory = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await findChatSession(sessionId);
    if (!session) return next(new ApiError(404, 'Session not found.'));
    // Same 404 HTTP status (never reveal a session exists but belongs to another user),
    // but machine-readable code so the frontend can clear a stale guest sessionId on login.
    if (session.userId !== userId) {
      return next(new ApiError(404, 'Session not found.', 'SESSION_USER_MISMATCH'));
    }

    // Fetch messages only after ownership is verified
    const rawMessages = await getChatHistory(sessionId, 30);

    // ChapterProgress is the single source of truth for topic progress (not chatState) —
    // see FOCUS_MODE_PROGRESS_FIX_PLAN.md. Look it up only when this session is on a chapter.
    const currentChapterId = session.chatState?.currentChapterId || null;
    let currentTopicId = null;
    let completedTopicIds = [];
    // ISSUE-1 (FOCUS_MODE_PROGRESS_FIX_PLAN.md): separate engagement stat, restored on
    // page refresh from the same already-fetched ChapterProgress doc.
    let totalDoubtsAsked = 0;
    let totalExplainMoreCount = 0;

    if (currentChapterId && session.sessionType === 'focus') {
      try {
        const progress = await getChapterProgress(userId, null, currentChapterId);
        currentTopicId = progress?.currentTopicId || null;
        completedTopicIds = progress?.completedTopicIds || [];
        totalDoubtsAsked = progress?.totalDoubtsAsked || 0;
        totalExplainMoreCount = progress?.totalExplainMoreCount || 0;
      } catch (err) {
        console.error('[getSessionHistory] getChapterProgress failed (non-fatal):', err.message);
      }
    }

    return sendResponse(res, 200, {
      message: 'Session history fetched successfully.',
      data: {
        sessionId,
        messages: rawMessages,
        sessionMeta: {
          title: session.title || 'New Chat',
          lastMessageAt: session.lastMessageAt,
          isLocked: session.chatState?.status === 'exhausted',
          sessionType: session.sessionType || 'global',
          currentChapterId,
          currentTopicId,
          completedTopicIds,
          totalDoubtsAsked,
          totalExplainMoreCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
