const SESSION_STORAGE_KEY = 'zuno.sessionId';

export const getSavedSessionId = () => {
  return window.localStorage.getItem(SESSION_STORAGE_KEY) || '';
};

export const saveSessionId = (sessionId) => {
  if (!sessionId) {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
};
