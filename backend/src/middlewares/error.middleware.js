import ApiError from '../utils/ApiError.js';

export const notFoundHandler = (error, _req, _res, next) => {
  if (error instanceof ApiError) {
    return next(error);
  }

  return next(new ApiError(404, 'Requested resource was not found.'));
};

export const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error.';

  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
    },
  });
};
