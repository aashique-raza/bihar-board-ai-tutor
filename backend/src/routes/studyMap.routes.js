import { Router } from 'express';

import { getStudyMapController } from '../controllers/studyMap.controller.js';

const router = Router();

router.get('/', getStudyMapController);

export default router;
