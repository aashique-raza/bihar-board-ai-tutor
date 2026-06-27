import { Router } from 'express';

import { getStudyMapController, getChapterTopicsController } from '../controllers/studyMap.controller.js';

const router = Router();

router.get('/', getStudyMapController);
router.get('/chapters/:chapterId/topics', getChapterTopicsController);

export default router;
