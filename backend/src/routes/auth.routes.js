import { Router } from 'express';
import { register, verifyEmail, login, logout, refreshToken, forgotPassword, resetPassword, googleAuth, googleCallback, getMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { loginLimiter, registerLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.post('/register', registerLimiter, register);
router.post('/verify-email', verifyEmail);
router.post('/login', loginLimiter, login);
router.post('/logout', requireAuth, logout);
router.post('/refresh', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', requireAuth, getMe);
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

export default router;
