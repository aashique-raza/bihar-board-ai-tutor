import { Router } from 'express';
import { register, verifyEmail, login, logout, refreshToken, forgotPassword, resetPassword, googleAuth, googleCallback } from '../controllers/auth.controller.js';
import { requireAuth } from '../auth/authMiddleware.js';

const router = Router();

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/logout', requireAuth, logout);
router.post('/refresh', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

export default router;
