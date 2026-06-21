import { Router } from 'express';
import { register, verifyEmail, login, logout, refreshToken, forgotPassword, resetPassword, googleAuth, googleCallback, getMe } from '../controllers/auth.controller.js';
import { requireAuth } from '../auth/authMiddleware.js';
import { authApiLimiter } from '../middlewares/rateLimiters.js';

const router = Router();

router.post('/register', authApiLimiter, register);
router.post('/verify-email', authApiLimiter, verifyEmail);
router.post('/login', authApiLimiter, login);
router.post('/logout', logout);
router.post('/refresh', refreshToken);
router.post('/forgot-password', authApiLimiter, forgotPassword);
router.post('/reset-password', authApiLimiter, resetPassword);
router.get('/me', requireAuth, getMe);
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

export default router;
