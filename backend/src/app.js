import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import askRoutes from './routes/ask.routes.js';
import authRoutes from './routes/auth.routes.js';
import healthRoutes from './routes/health.routes.js';
import sessionRoutes from './routes/session.routes.js';
import studyMapRoutes from './routes/studyMap.routes.js';
import ApiError from './utils/ApiError.js';
import { sendResponse } from './utils/sendResponse.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { globalApiLimiter } from './middlewares/rateLimiters.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  return sendResponse(res, 200, {
    message: 'Bihar Board AI Tutor backend is running.',
  });
});

app.use('/health', healthRoutes);

// Apply global rate limiter only to API routes
app.use('/api', globalApiLimiter);

app.use('/api/v1/ask', askRoutes);
app.use('/api/v1/study-map', studyMapRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/sessions', sessionRoutes);

app.use((req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
});

app.use(errorHandler);

export default app;
