import axiosInstance from '../services/axios/axiosInstance.js';

export const SUPPORT_CATEGORIES = [
  { value: 'bug', label: 'Bug / Problem' },
  { value: 'wrong_answer', label: 'Wrong Answer' },
  { value: 'feedback', label: 'Suggestion / Feedback' },
  { value: 'other', label: 'Other' },
];

export const submitSupportRequest = async ({ category, subject, description, email, sessionId }) => {
  try {
    const { data } = await axiosInstance.post('/api/v1/support', {
      category,
      subject,
      description,
      email,
      sessionId,
    });
    return data.data;
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      'Support request submit nahi hui. Please dobara try karo.';
    throw new Error(message);
  }
};
