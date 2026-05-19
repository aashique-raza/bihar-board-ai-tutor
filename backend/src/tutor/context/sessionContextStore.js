const DEFAULT_SESSION_ID = 'default';
const sessionContexts = new Map();

export const normalizeSessionId = (sessionId) =>
  String(sessionId || DEFAULT_SESSION_ID).trim() || DEFAULT_SESSION_ID;

export const getSessionContext = (sessionId) => {
  const normalizedSessionId = normalizeSessionId(sessionId);

  return sessionContexts.get(normalizedSessionId) || {
    sessionId: normalizedSessionId,
    turnCount: 0,
    lastIntent: null,
    lastSubject: null,
    lastSection: null,
    lastChapterId: null,
    lastTopic: null,
    lastQuestion: null,
    lastAnswer: null,
    lastSources: [],
  };
};

export const updateSessionContext = (sessionId, patch = {}) => {
  const currentContext = getSessionContext(sessionId);
  const nextContext = {
    ...currentContext,
    ...patch,
    sessionId: currentContext.sessionId,
    turnCount: currentContext.turnCount + 1,
    updatedAt: new Date().toISOString(),
  };

  sessionContexts.set(currentContext.sessionId, nextContext);

  return nextContext;
};

