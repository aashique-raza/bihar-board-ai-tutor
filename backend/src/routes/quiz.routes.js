import { Router } from 'express';
import { optionalAuth } from '../auth/authMiddleware.js';
import { quizGenerateLimiter, quizSubmitLimiter } from '../middlewares/rateLimiters.js';
import { generateQuizController, submitQuizController } from '../controllers/quiz.controller.js';

const router = Router();

// optionalAuth attaches req.user for logged-in users without blocking guests —
// quiz supports guests (identity comes from X-Guest-Id instead), same as
// chapterProgress and ask routes.
router.use(optionalAuth);

router.post('/generate', quizGenerateLimiter, generateQuizController); // POST /api/v1/quiz/generate
router.post('/submit', quizSubmitLimiter, submitQuizController);       // POST /api/v1/quiz/submit

export default router;
