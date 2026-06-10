import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistReducer, persistStore } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import authReducer from './slices/authSlice.js';

// Auth is NOT persisted — access tokens are short-lived and restored via
// silent refresh (HttpOnly cookie) on every page load. Persisting tokens
// in localStorage would be a security risk and is unnecessary.
const persistConfig = {
  key: 'zuno',
  storage,
  whitelist: [], // nothing persisted yet — add future slices here as needed
};

const rootReducer = combineReducers({
  auth: authReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // redux-persist dispatches actions with non-serializable values internally
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

export const persistor = persistStore(store);
