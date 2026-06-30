import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redis from '../config/redisClient.js';

// Utility to create a standardized JSON response for rate limits
const createRateLimitResponse = (message) => ({
  success: false,
  error: {
    code: 'RATE_LIMIT_EXCEEDED',
    message,
  },
});

// Each limiter gets its own Redis key namespace via prefix.
// Without unique prefixes, all three limiters would share counters — wrong behavior.
const createRedisStore = (prefix) =>
  new RedisStore({
    sendCommand: async (command, ...args) => redis.call(command, ...args),
    prefix,
  });

// 1. Global API Limiter (Protects against basic scraping and DDoS)
// Max 150 requests per 15 minutes per IP
export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: createRedisStore('rl_global:'),
  handler: (req, res) => {
    res.status(429).json(
      createRateLimitResponse('Bahut saari requests aa rahi hain. Kripya thodi der baad try karein.')
    );
  },
});

// 2. Ask API Limiter (Protects expensive LLM endpoints)
// Max 30 requests per 1 minute per IP
export const askApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: createRedisStore('rl_ask:'),
  handler: (req, res) => {
    res.status(429).json(
      createRateLimitResponse('Aap bahut tezi se sawal pooch rahe hain. Ek minute rukiye aur fir try karein.')
    );
  },
});

// 3. Auth API Limiter (Protects against brute force login/OTP/register)
// Max 20 requests per 1 hour per IP
export const authApiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: createRedisStore('rl_auth:'),
  handler: (req, res) => {
    res.status(429).json(
      createRateLimitResponse('Security karan se account access temporarily block kiya gaya hai. 1 ghante baad try karein.')
    );
  },
});
