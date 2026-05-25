import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import askRoutes from './routes/ask.routes.js';
import healthRoutes from './routes/health.routes.js';
import studyMapRoutes from './routes/studyMap.routes.js';
import ApiError from './utils/ApiError.js';
import { sendResponse } from './utils/sendResponse.js';
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  return sendResponse(res, 200, {
    message: 'Bihar Board AI Tutor backend is running.',
  });
});

app.use('/health', healthRoutes);
app.use('/api/v1/ask', askRoutes);
app.use('/api/v1/study-map', studyMapRoutes);

app.use((req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
});

app.use(errorHandler);

export default app;
