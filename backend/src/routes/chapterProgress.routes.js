import { Router } from 'express';
import { optionalAuth } from '../auth/authMiddleware.js';
import {
  getChapterProgressController,
  listChapterProgressController,
  chapterActionController,
} from '../controllers/chapterProgress.controller.js';

const router = Router();

// optionalAuth attaches req.user for logged-in users without blocking guests
router.use(optionalAuth);

router.get('/',              listChapterProgressController);       // GET  /api/v1/chapter-progress
router.get('/:chapterId',    getChapterProgressController);        // GET  /api/v1/chapter-progress/:chapterId
router.post('/:chapterId/action', chapterActionController);        // POST /api/v1/chapter-progress/:chapterId/action

export default router;
