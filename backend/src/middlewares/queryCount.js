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

  const GUEST_DAILY_LIMIT = 5;
  const FREE_DAILY_LIMIT = 20;

  if (req.user !== null) {
    // CASE A — Logged-in user
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
  } else {
    // CASE B — Guest user
    const UUID_REGEX = /^[0-9a-f-]{36}$/i;
    const guestId = req.headers['x-guest-id'];

    if (!guestId || !UUID_REGEX.test(guestId.trim())) {
      return sendResponse(res, 400, { message: 'Valid guest ID required.' });
    }

    const key = `guest_query:${guestId.trim()}`;

    try {
      const ttl = secondsTillMidnightIST();
      await redis.set(key, 0, 'EX', ttl, 'NX');
      const count = Number(await redis.incr(key));

      if (count > GUEST_DAILY_LIMIT) {
        return sendResponse(res, 429, { message: 'Guest limit khatam ho gayi. Login karo aur zyada questions poochho!' });
      }

      return next();
    } catch (err) {
      console.error('[QueryCount] Redis error (guest):', err);
      return next();
    }
  }
}
