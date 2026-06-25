import redis from '../config/redisClient.js';
import { sendResponse } from '../utils/sendResponse.js';

function secondsTillMidnightIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const midnight = new Date(ist);
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight - ist) / 1000);
}

export async function queryCountMiddleware(req, res, next) {
  // Skip rate limiting in development so testing is not blocked by daily limits
  if (process.env.NODE_ENV === 'development') return next();

  // Guests are handled entirely by guestRateLimit.js (lifetime counter, Redis guest_turns:guestId).
  // The daily guest counter (guest_query:) was redundant — lifetime limit always fires first
  // since both limits were 5. UUID validation also moved to guestRateLimit.js.
  if (!req.user) return next();

  const FREE_DAILY_LIMIT = 20;

  // Pro users have no daily cap
  if (req.user.plan === 'pro') return next();

  const userId = req.user._id.toString();
  const key = `user_query:${userId}`;

  try {
    const ttl = secondsTillMidnightIST();
    await redis.set(key, 0, 'EX', ttl, 'NX');
    const count = Number(await redis.incr(key));

    if (count > FREE_DAILY_LIMIT) {
      return sendResponse(res, 429, { message: 'Aaj ki daily limit khatam ho gayi. Kal dobara aao!' });
    }

    return next();
  } catch (err) {
    console.error('[QueryCount] Redis error (logged-in):', err);
    return next();
  }
}
