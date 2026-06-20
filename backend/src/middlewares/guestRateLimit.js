import redis from '../config/redisClient.js';
import { env } from '../config/env.js';

export const guestRateLimit = async (req, res, next) => {
  // Logged-in users are not subject to the guest turn limit
  if (req.user) return next();

  const guestId = req.headers['x-guest-id'];
  if (!guestId) return next();

  try {
    const count = parseInt((await redis.get(`guest_turns:${guestId}`)) || '0', 10);
    if (count >= env.guestTurnLimit) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'GUEST_LIMIT_REACHED',
          message: 'Guest limit ho gayi. Login karke padhai jaari rakho!',
          statusCode: 429,
        },
      });
    }
    next();
  } catch (err) {
    // Redis outage — fail open so students are not blocked
    console.error('[guestRateLimit] Redis check failed, failing open:', err.message);
    next();
  }
};
