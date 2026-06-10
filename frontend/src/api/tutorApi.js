import axiosInstance from '../services/axios/axiosInstance.js';

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

export const askTutor = async ({ question, studyMode, chapterId, sessionId }, signal) => {
  const body = { question, studyMode };

  if (sessionId) {
    body.sessionId = sessionId;
  }

  if (studyMode === 'focus') {
    body.chapterId = chapterId;
  }

  try {
    const { data } = await axiosInstance.post('/api/v1/ask', body, { signal });
    return data.data;
  } catch (error) {
    // Axios uses CanceledError / ERR_CANCELED when aborted via AbortController.
    // App.jsx checks error.name === 'AbortError', so we re-throw with that name.
    if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
      const abortError = new Error('Request was cancelled');
      abortError.name = 'AbortError';
      throw abortError;
    }
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      'Something went wrong while talking to Zuno.';
    throw new Error(message);
  }
};
