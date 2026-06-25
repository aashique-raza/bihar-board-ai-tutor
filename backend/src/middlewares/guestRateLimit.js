import redis from '../config/redisClient.js';
import { env } from '../config/env.js';

// Same pattern as queryCount.js — 36-char UUID with dashes
const GUEST_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const guestRateLimit = async (req, res, next) => {
  // Logged-in users are not subject to the guest turn limit
  if (req.user) return next();

  // Skip in development so guest limit doesn't block local testing
  if (process.env.NODE_ENV === 'development') return next();

  const guestId = req.headers['x-guest-id'];

  // Require a valid UUID — prevents limitless access from requests with no/invalid guestId.
  // Previously this guard lived in queryCount.js guest branch; moved here so it fires first.
  if (!guestId || !GUEST_ID_REGEX.test(guestId.trim())) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_GUEST_ID',
        message: 'Valid guest ID required.',
        statusCode: 400,
      },
    });
  }

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
