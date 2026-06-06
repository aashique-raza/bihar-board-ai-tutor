/**
 * providerErrors.js
 *
 * Handles LLM provider errors across the Ask pipeline.
 * - Classifies errors by type
 * - Provides student-friendly Hinglish messages
 * - Builds a valid error response shape for the frontend
 */

// Custom error class — thrown by Step 4 and Step 6 on provider failure
export class ProviderUnavailableError extends Error {
  constructor(errorType, originalMessage) {
    super(`Provider unavailable: ${errorType}`);
    this.name = 'ProviderUnavailableError';
    this.errorType = errorType; // 'rate_limit' | 'auth_error' | 'network_error'
    this.originalMessage = originalMessage;
  }
}

// Classify a caught error into one of 4 types
export const classifyProviderError = (error) => {
  const status = error?.status || error?.response?.status;
  const code = error?.code;
  const message = String(error?.message || '').toLowerCase();

  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'rate_limit';
  }
  if (status === 401 || status === 403 || message.includes('auth') || message.includes('api key')) {
    return 'auth_error';
  }
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || message.includes('timeout')) {
    return 'network_error';
  }
  // JSON parse failure or unknown
  return 'parse_error';
};

// 10 minutes in milliseconds
const TEN_MINUTES = 10 * 60 * 1000;

// Calculate how many consecutive errors to count — resets if last error was 10+ min ago
export const getEffectiveErrorCount = (consecutiveErrors, lastErrorAt) => {
  // No previous error recorded — treat as fresh
  if (!lastErrorAt) return 0;

  const timeSinceLastError = Date.now() - new Date(lastErrorAt).getTime();

  // Student came back after a gap — reset count
  if (timeSinceLastError > TEN_MINUTES) return 0;

  return consecutiveErrors || 0;
};

// Return the right Hinglish message based on error type and how many times it happened
export const getProviderErrorMessage = (errorType, effectiveCount, question) => {
  if (errorType === 'rate_limit') {
    if (effectiveCount === 0) {
      return `"${question}" — ye sawaal pakad liya. Abhi bahut saare students ek saath padh rahe hain, server thoda busy hai. 1-2 minute mein wapas aao, wahan se shuru karenge!`;
    }
    if (effectiveCount === 1) {
      return 'Abhi bhi server pe thodi bheed hai. Ek kaam karo — 2 minute ka break lo, jo yaad hai notebook mein likh lo, phir aao. Main yahan hoon.';
    }
    return 'Aaj Zuno thoda overwhelmed hai itne students se 😄 Seedha baat — 10 minute baad fresh aana. Ye bhi padhai ka hissa hai!';
  }

  if (errorType === 'network_error') {
    return 'Connection thoda slow lag raha hai. Page refresh karke dobara try karo — aksar 30 second mein theek ho jaata hai.';
  }

  // auth_error or unknown — do not expose details
  return 'Kuch technical dikkat aa gayi abhi. Thodi der mein theek ho jaayegi — dobara try karo.';
};

// Build a valid response shape that the frontend can render without crashing
// Shape must match what App.jsx expects from a normal API response
export const buildProviderErrorResponse = (message, question, studyMode) => ({
  status: 'provider_error',
  responseMode: 'conversation',
  studyMode: studyMode || 'global',
  question,
  title: null,
  sections: [{ heading: '', content: message }],
  answer: message,
  sources: [],
  suggestedActions: [],
  retrieval: null,
  decision: null,
  session: null,
});
