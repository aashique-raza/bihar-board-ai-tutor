import { Router } from 'express';

import { askQuestionController } from '../controllers/ask.controller.js';

const router = Router();

router.post('/', askQuestionController);

export default router;
