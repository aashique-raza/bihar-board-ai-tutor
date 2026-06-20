import { Router } from 'express';

import { askQuestionController } from '../controllers/ask.controller.js';
import { optionalAuth } from '../auth/authMiddleware.js';
import { queryCountMiddleware } from '../middlewares/queryCount.js';
import { guestRateLimit } from '../middlewares/guestRateLimit.js';

const router = Router();

router.post('/', optionalAuth, guestRateLimit, queryCountMiddleware, askQuestionController);

export default router;
