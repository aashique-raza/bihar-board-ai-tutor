import { Router } from 'express';
import { register, verifyEmail, login, logout, refreshToken } from '../controllers/auth.controller.js';
import { requireAuth } from '../auth/authMiddleware.js';

const router = Router();

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.post('/refresh', refreshToken);

export default router;
