import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,         // object: { id, name, email, role, plan, ... } or null
  accessToken: null,  // string or null
  isLoading: true,    // true on app start — wait for silent refresh before deciding
  error: null,        // string or null — for login/register error messages
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Set user and token after successful login or token refresh
    setCredentials(state, action) {
      const { user, accessToken } = action.payload;
      state.user = user;
      state.accessToken = accessToken;
      state.error = null;
    },
    // Clear auth state on logout or failed refresh
    clearCredentials(state) {
      state.user = null;
      state.accessToken = null;
      state.isLoading = false;
    },
    // Control loading state during silent refresh on app start
    setLoading(state, action) {
      state.isLoading = action.payload;
    },
    // Store error message from login/register failures
    setError(state, action) {
      state.error = action.payload;
    },
  },
});

export const { setCredentials, clearCredentials, setLoading, setError } = authSlice.actions;

export const selectUser = (state) => state.auth.user;
export const selectAccessToken = (state) => state.auth.accessToken;
export const selectIsLoading = (state) => state.auth.isLoading;
export const selectIsLoggedIn = (state) => state.auth.accessToken !== null;

export default authSlice.reducer;
