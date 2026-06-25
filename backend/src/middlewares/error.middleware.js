/**
 * error.middleware.js
 *
 * Last-resort error handler for Express.
 * Never sends raw error messages to students — they may contain
 * API key details, model names, or provider internals.
 */

export const errorHandler = (error, _req, res, _next) => {
  // Always log the real error server-side for debugging
  console.error('[ErrorMiddleware] Unhandled error:', error);

  const statusCode = error.statusCode || 500;

  // For server errors, never expose internal details to the client
  const safeMessage = statusCode >= 500
    ? 'Kuch technical dikkat aa gayi. Thodi der mein try karo.'
    : error.message || 'Kuch galat hua.';

  return res.status(statusCode).json({
    success: false,
    error: {
      message: safeMessage,
      statusCode,
      ...(error.code ? { code: error.code } : {}),
    },
  });
};
