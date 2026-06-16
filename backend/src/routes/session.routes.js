import { Router } from 'express';
import { getSessions, getSessionHistory } from '../controllers/session.controller.js';
import { requireAuth } from '../auth/authMiddleware.js';

const router = Router();

// GET /api/v1/sessions
router.get('/', requireAuth, getSessions);

// GET /api/v1/sessions/:sessionId/history
router.get('/:sessionId/history', requireAuth, getSessionHistory);

export default router;
