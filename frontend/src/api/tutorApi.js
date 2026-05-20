const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      'Something went wrong while talking to Zuno.';

    throw new Error(message);
  }

  return payload;
};

export const fetchStudyMap = async () => {
  const response = await fetch(`${API_BASE_URL}/api/v1/study-map`);
  const payload = await parseJsonResponse(response);

  return payload.data;
};

export const askTutor = async ({ question, studyMode, chapterId, sessionId }) => {
  const body = { question, studyMode };

  if (sessionId) {
    body.sessionId = sessionId;
  }

  if (studyMode === 'focus') {
    body.chapterId = chapterId;
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await parseJsonResponse(response);

  return payload.data;
};
