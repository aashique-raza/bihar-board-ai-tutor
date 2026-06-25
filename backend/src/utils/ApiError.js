class ApiError extends Error {
  constructor(statusCode, message, code = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code; // machine-readable error code for frontend (e.g. 'SESSION_USER_MISMATCH')
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
