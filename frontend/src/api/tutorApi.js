import axiosInstance from '../services/axios/axiosInstance.js';
import { store } from '../store/store.js';
import { parse } from 'partial-json';
import { setCredentials, clearCredentials } from '../store/slices/authSlice.js';
import { refreshAccessToken } from '../services/axios/authService.js';

const getGuestId = () => {
  const GUEST_ID_KEY = 'zuno-guest-id';
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = crypto.randomUUID();
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
};

export const fetchStudyMap = async () => {
  try {
    const { data } = await axiosInstance.get('/api/v1/study-map');
    return data.data;
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      'Something went wrong while loading the study map.';
    throw new Error(message);
  }
};

export const deleteSession = async (sessionId) => {
  await axiosInstance.delete(`/api/v1/sessions/${encodeURIComponent(sessionId)}`);
};

export const renameSession = async (sessionId, title) => {
  const { data } = await axiosInstance.patch(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/rename`,
    { title }
  );
  return data.data;
};

export const fetchSessions = async () => {
  try {
    const { data } = await axiosInstance.get('/api/v1/sessions');
    return data.data; // shape: { sessions: [...] }
  } catch (err) {
    if (err.response?.status !== 401) {
      console.error('[fetchSessions]', err.message);
    }
    return { sessions: [] };
  }
};

export const fetchSessionHistory = async (sessionId) => {
  try {
    const { data } = await axiosInstance.get(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/history`
    );
    return data.data;
  } catch (err) {
    // 401 is silent — axios interceptor handles token refresh / logout
    if (err.response?.status === 401) return null;

    // For all other errors, throw with the backend's machine-readable code attached.
    // ChatPage uses this to distinguish a stale guest sessionId (SESSION_USER_MISMATCH)
    // from a genuine network failure, so it only clears localStorage when appropriate.
    const error = new Error(
      err.response?.data?.error?.message || 'Session history load nahi hui.'
    );
    error.code = err.response?.data?.error?.code || null;
    error.status = err.response?.status || 0;
    throw error;
  }
};

// ─── Chapter Progress API ──────────────────────────────────────────────────
// All three functions use axiosInstance so auth token + X-Guest-Id are sent
// automatically via the request interceptor.

export const fetchChapterProgress = async (chapterId) => {
  try {
    const { data } = await axiosInstance.get(
      `/api/v1/chapter-progress/${encodeURIComponent(chapterId)}`
    );
    return data.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw new Error(
      err.response?.data?.error?.message || 'Chapter progress load nahi hui.'
    );
  }
};

export const listChapterProgress = async ({ status, limit = 10 } = {}) => {
  try {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (limit)  params.set('limit', String(limit));
    const { data } = await axiosInstance.get(`/api/v1/chapter-progress?${params}`);
    return data.data;
  } catch (err) {
    throw new Error(
      err.response?.data?.error?.message || 'Chapter progress list load nahi hui.'
    );
  }
};

export const chapterProgressAction = async (chapterId, action, topicId = null) => {
  try {
    const { data } = await axiosInstance.post(
      `/api/v1/chapter-progress/${encodeURIComponent(chapterId)}/action`,
      { action, ...(topicId && { topicId }) }
    );
    return data.data;
  } catch (err) {
    throw new Error(
      err.response?.data?.error?.message || 'Chapter action fail ho gayi.'
    );
  }
};

// ─── Streaming Ask API ─────────────────────────────────────────────────────
// Wraps fetch() with one silent token refresh on 401 — mirrors the axios interceptor pattern.
// Only attempts refresh for logged-in users (accessToken present); guests are skipped.
// retried flag prevents infinite refresh loops.
const fetchWithTokenRefresh = async (url, options, retried = false) => {
  const response = await fetch(url, options);

  if (response.status === 401 && !retried && store.getState().auth?.accessToken) {
    try {
      const data = await refreshAccessToken();
      const newToken = data?.data?.accessToken;
      if (!newToken) throw new Error('No token in refresh response');

      store.dispatch(
        setCredentials({ user: store.getState().auth.user, accessToken: newToken })
      );

      const newOptions = {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
      };
      return fetchWithTokenRefresh(url, newOptions, true);
    } catch {
      sessionStorage.setItem('zuno.authRedirect', 'Session expire ho gayi. Dobara login karo.');
      store.dispatch(clearCredentials());
      return response; // return original 401 — caller handles the error display
    }
  }

  return response;
};

export const askTutor = async ({ question, studyMode, chapterId, sessionId }, signal, onUpdate = null) => {
  const body = { question, studyMode };

  if (sessionId) {
    body.sessionId = sessionId;
  }

  if (studyMode === 'focus') {
    body.chapterId = chapterId;
  }

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
  const token = store.getState().auth?.accessToken;
  const headers = {
    'Content-Type': 'application/json',
    'X-Guest-Id': getGuestId(),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetchWithTokenRefresh(`${API_BASE_URL}/api/v1/ask`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json();
      const error = new Error();
      error.response = { status: response.status, data: errorData };
      error.code = errorData.error?.code;
      throw error;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      let finalPayload = null;
      let lastUpdateTime = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.replace(/^data:\s*/, '').trim();
          if (!dataStr) continue;

          const dataObj = JSON.parse(dataStr);
          
          if (dataObj.event === 'end') {
            finalPayload = dataObj.payload;
            break;
          }

          if (dataObj.token) {
            accumulatedText += dataObj.token;
            const now = Date.now();
            if (onUpdate && (now - lastUpdateTime > 33)) {
              try {
                const partialObj = parse(accumulatedText);
                onUpdate(partialObj);
              } catch (e) {
                // Ignore transient parsing issues
              }
              lastUpdateTime = now;
            }
          }
        }
      }
      return finalPayload;
    } else {
      const data = await response.json();
      return data.data;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }
    if (
      error.response?.status === 429 &&
      error.response?.data?.error?.code === 'GUEST_LIMIT_REACHED'
    ) {
      const e = new Error(error.response.data.error.message);
      e.code = 'GUEST_LIMIT_REACHED';
      throw e;
    }
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      'Something went wrong while talking to Zuno.';
    throw new Error(message);
  }
};
