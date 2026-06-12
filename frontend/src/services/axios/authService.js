import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

// All auth calls use a plain axios instance — NOT axiosInstance.
// Reason: auth calls don't need a Bearer token, and using axiosInstance would
// risk the response interceptor triggering a refresh loop on auth failures.
const authAxios = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // needed to send/receive the HttpOnly refresh token cookie
});

export const loginUser = async ({ email, password }) => {
  try {
    const { data } = await authAxios.post('/api/v1/auth/login', { email, password });
    return data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || 'Login fail hua. Please dobara try karo.'
    );
  }
};

export const registerUser = async ({ name, email, password }) => {
  try {
    const { data } = await authAxios.post('/api/v1/auth/register', { name, email, password });
    return data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || 'Registration fail hui. Please dobara try karo.'
    );
  }
};

export const logoutUser = async () => {
  try {
    const { data } = await authAxios.post('/api/v1/auth/logout');
    return data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || 'Logout fail hua.'
    );
  }
};

export const refreshAccessToken = async () => {
  try {
    const { data } = await authAxios.post('/api/v1/auth/refresh');
    return data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || 'Session expire ho gayi. Please login karo.'
    );
  }
};

export const getMe = async (accessToken) => {
  try {
    const { data } = await authAxios.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Backend returns { success, data: { user: {...} } }
    // Normalize here so all callers get the user object directly
    return data?.data?.user || data?.data || data;
  } catch (error) {
    throw new Error(
      error.response?.data?.message || 'User info load nahi hui.'
    );
  }
};
