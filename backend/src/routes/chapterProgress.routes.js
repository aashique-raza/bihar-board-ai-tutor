import { Router } from 'express';
import {
  getChapterProgressController,
  listChapterProgressController,
  chapterActionController,
} from '../controllers/chapterProgress.controller.js';

const router = Router();

router.get('/',              listChapterProgressController);       // GET  /api/v1/chapter-progress
router.get('/:chapterId',    getChapterProgressController);        // GET  /api/v1/chapter-progress/:chapterId
router.post('/:chapterId/action', chapterActionController);        // POST /api/v1/chapter-progress/:chapterId/action

export default router;
