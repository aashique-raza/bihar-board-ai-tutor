import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');

dotenv.config({
  path: path.resolve(backendRoot, '.env'),
});

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 5000),
  mongodbUri: process.env.MONGODB_URI || process.env.MONGO_URI || '',
  sessionTokenLimit: toNumber(process.env.SESSION_TOKEN_LIMIT, 15000),
  sessionsListLimit: toNumber(process.env.SESSIONS_LIST_LIMIT, 20),
  guestTurnLimit: toNumber(process.env.GUEST_TURN_LIMIT, 5),
  // Phase 3: max casual/off-topic turns before hard block per session.
  // Math.max(1,...) guards against 0 or negative values in .env.
  maxNonAcademicTurns: Math.max(1, toNumber(process.env.MAX_NON_ACADEMIC_TURNS, 10)),
};

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const VALID_PROVIDERS = ['groq', 'openai', 'google'];

// Maps each provider to its required API key(s).
// To add a new provider: add one entry here — no other logic changes needed.
const PROVIDER_KEY_MAP = {
  groq: ['GROQ_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GOOGLE_API_KEY'], // GEMINI_API_KEY accepted as fallback (see hasProviderKey)
};

// Mirrors the isUsableApiKey check in geminiEmbeddings.js — rejects placeholder
// values like "...", "your_key_here", and anything suspiciously short.
const isRealKey = (value) =>
  typeof value === 'string' &&
  value.trim().length > 10 &&
  !value.includes('your_') &&
  value !== '...';

// Returns true if the required key for this provider has a real (non-placeholder) value.
// Handles the google special case where GEMINI_API_KEY is accepted as a fallback
// (mirrors the behaviour in chatModel.js and geminiEmbeddings.js).
const hasProviderKey = (provider, key) => {
  if (provider === 'google' && key === 'GOOGLE_API_KEY') {
    return isRealKey(process.env.GOOGLE_API_KEY) || isRealKey(process.env.GEMINI_API_KEY);
  }
  return isRealKey(process.env[key]);
};

/**
 * Validates all required environment variables before the server starts.
 * Collects every missing variable, then logs them together and exits.
 * Call this as the very first thing in server.js.
 */
export const validateEnv = () => {
  const missing = [];

  // MongoDB — MONGO_URI accepted as fallback (mirrors existing env.mongodbUri logic)
  if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
    missing.push('MONGODB_URI');
  }

  // Embeddings key — required key depends on EMBEDDING_PROVIDER
  // EMBEDDING_PROVIDER=openai  → needs OPENAI_API_KEY
  // EMBEDDING_PROVIDER=google (default) → needs GEMINI_API_KEY or GOOGLE_API_KEY
  const embeddingProvider = (process.env.EMBEDDING_PROVIDER || 'google').toLowerCase();
  if (embeddingProvider === 'openai') {
    if (!isRealKey(process.env.OPENAI_API_KEY)) {
      missing.push('OPENAI_API_KEY (required when EMBEDDING_PROVIDER=openai)');
    }
  } else {
    if (!isRealKey(process.env.GEMINI_API_KEY) && !isRealKey(process.env.GOOGLE_API_KEY)) {
      missing.push('GEMINI_API_KEY');
    }
  }

  // LLM provider presence and validity
  const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (!provider) {
    missing.push('LLM_PROVIDER');
  } else if (!VALID_PROVIDERS.includes(provider)) {
    missing.push(
      `LLM_PROVIDER — got "${provider}", must be one of: ${VALID_PROVIDERS.join(', ')}`
    );
  } else {
    // Provider-specific API key check
    for (const key of PROVIDER_KEY_MAP[provider] ?? []) {
      if (!hasProviderKey(provider, key)) {
        missing.push(key);
      }
    }
  }

  // Email — required for sending verification and reset emails
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_HOST.trim()) {
    missing.push('EMAIL_HOST (e.g. smtp.gmail.com)');
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_USER.trim()) {
    missing.push('EMAIL_USER');
  }
  if (!process.env.EMAIL_PASS || !process.env.EMAIL_PASS.trim()) {
    missing.push('EMAIL_PASS');
  }

  // Frontend URL — required for building email links
  if (!process.env.FRONTEND_URL || !process.env.FRONTEND_URL.trim()) {
    missing.push('FRONTEND_URL');
  }

  if (missing.length === 0) return;

  console.error(
    '\n[Zuno] ❌ Server startup failed — missing required environment variables:\n\n' +
      missing.map((k) => `  * ${k}`).join('\n') +
      '\n\nFix these in backend/.env and restart.\n'
  );
  process.exit(1);
};
