import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import redis from '../config/redisClient.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { sendResponse } from '../utils/sendResponse.js';
import { sendVerificationEmail } from '../auth/emailHelpers.js';

// Simple email format check — not too strict, just catches obvious mistakes
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// TTL constants
const VERIFY_EMAIL_TTL = 60 * 60 * 24; // 24 hours in seconds

/**
 * POST /api/v1/auth/register
 * Register a new user with email + password.
 * Sends a verification email before confirming success.
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // --- Validation ---
    if (!name || !email || !password) {
      throw new ApiError(400, 'Name, email aur password teeno zaroori hain.');
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      throw new ApiError(400, 'Valid email address dalo.');
    }

    if (password.length < 8) {
      throw new ApiError(400, 'Password kam se kam 8 characters ka hona chahiye.');
    }

    // --- Check duplicate email ---
    // Note: We also catch the MongoDB unique index error below as a safety net
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      throw new ApiError(400, 'Yeh email already registered hai.');
    }

    // --- Hash password ---
    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // --- Save user (unverified) ---
    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      authProvider: 'email',
      isEmailVerified: false,
    });

    // --- Generate verification token ---
    const token = crypto.randomBytes(32).toString('hex');
    const userId = user._id.toString();

    // --- Store in Redis (2 keys for forward + reverse lookup) ---
    await redis.set(`verify_email:${token}`, userId, 'EX', VERIFY_EMAIL_TTL);
    await redis.set(`verify_email:${userId}`, token, 'EX', VERIFY_EMAIL_TTL);

    // --- Send verification email ---
    // If this fails, rollback: delete user from DB so they can register again cleanly
    try {
      await sendVerificationEmail(cleanEmail, token);
    } catch (emailError) {
      // Rollback: remove the user we just created
      await User.deleteOne({ _id: user._id });
      // Also clean up Redis keys
      await redis.del(`verify_email:${token}`);
      await redis.del(`verify_email:${userId}`);
      console.error('[Register] Email send failed, rolling back user creation:', emailError);
      throw new ApiError(500, 'Verification email nahi bheja ja saka. Thodi der baad dobara try karo.');
    }

    console.log('[Auth] Registered (pending verification):', cleanEmail);

    return sendResponse(res, 201, {
      message: 'Registration successful! Verification email bheja gaya hai. Inbox check karo.',
    });

  } catch (err) {
    // Catch MongoDB duplicate key error (race condition safety net)
    if (err.code === 11000) {
      return next(new ApiError(400, 'Yeh email already registered hai.'));
    }
    next(err);
  }
};

/**
 * POST /api/v1/auth/verify-email
 * Verify email using the token sent in the verification email.
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new ApiError(400, 'Verification token missing hai.');
    }

    // --- Look up token in Redis ---
    const userId = await redis.get(`verify_email:${token}`);

    if (!userId) {
      throw new ApiError(400, 'Verification link expire ho gaya hai ya invalid hai.');
    }

    // --- Find user in DB ---
    const user = await User.findById(userId);
    if (!user) {
      // Rare: Redis has token but user deleted from DB
      await redis.del(`verify_email:${token}`);
      throw new ApiError(400, 'User nahi mila. Dobara register karo.');
    }

    // --- Mark email as verified ---
    user.isEmailVerified = true;
    await user.save();

    // --- Clean up both Redis keys ---
    await redis.del(`verify_email:${token}`);
    await redis.del(`verify_email:${userId}`);

    console.log('[Auth] Email verified:', user.email);

    return sendResponse(res, 200, {
      message: 'Email verify ho gaya! Ab login karo.',
    });

  } catch (err) {
    next(err);
  }
};
