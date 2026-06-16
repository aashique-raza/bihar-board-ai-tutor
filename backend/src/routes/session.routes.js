import { Router } from 'express';
import { getSessions, getSessionHistory, deleteSession, renameSession } from '../controllers/session.controller.js';
import { requireAuth } from '../auth/authMiddleware.js';

const router = Router();

// GET /api/v1/sessions
router.get('/', requireAuth, getSessions);

// GET /api/v1/sessions/:sessionId/history
router.get('/:sessionId/history', requireAuth, getSessionHistory);

// DELETE /api/v1/sessions/:sessionId
router.delete('/:sessionId', requireAuth, deleteSession);

// PATCH /api/v1/sessions/:sessionId/rename
router.patch('/:sessionId/rename', requireAuth, renameSession);

export default router;
