import { Router } from 'express';
import { register, verifyEmail, login } from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);

export default router;
