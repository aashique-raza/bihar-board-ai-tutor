import { Router } from 'express';

import { askQuestionController } from '../controllers/ask.controller.js';
import { optionalAuth } from '../auth/authMiddleware.js';
import { queryCountMiddleware } from '../middlewares/queryCount.js';

const router = Router();

router.post('/', optionalAuth, queryCountMiddleware, askQuestionController);

export default router;
