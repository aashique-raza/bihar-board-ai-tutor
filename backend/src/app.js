import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import healthRoutes from './routes/health.routes.js';
import ApiError from './utils/ApiError.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Bihar Board AI Tutor backend is running.',
  });
});

app.use('/health', healthRoutes);

app.use((req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
