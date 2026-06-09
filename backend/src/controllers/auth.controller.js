import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import redis from '../config/redisClient.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import { sendResponse } from '../utils/sendResponse.js';
import { sendVerificationEmail } from '../auth/emailHelpers.js';
import { generateAccessToken, generateRefreshToken } from '../auth/tokenHelpers.js';

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

// A valid bcrypt hash used as a dummy for timing-safe "user not found" case.
// bcrypt.compare() against this hash will always return false,
// but it takes the same ~100ms as a real comparison — preventing timing attacks.
const DUMMY_HASH = '$2b$12$KIXBnNGSPXV5zxNWEJZRPOqQmIJdZZqXP5kVXEzpAFgOYF0qOdVVa';

// Cookie maxAge and Redis TTL for refresh token — 7 days
const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // milliseconds (for cookie)
const REFRESH_TOKEN_REDIS_TTL = 7 * 24 * 60 * 60;             // seconds (for Redis EX)

/**
 * POST /api/v1/auth/login
 * Authenticate a user with email and password.
 * Returns an access token in the response body and sets a refresh token as an HttpOnly cookie.
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // --- Step 1: Basic validation ---
    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required.');
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      throw new ApiError(400, 'Please enter a valid email address.');
    }

    // --- Step 2: Find user by email ---
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      // Run dummy bcrypt compare to prevent timing attacks.
      // Without this, "user not found" returns instantly while "wrong password"
      // takes ~100ms — an attacker can detect which emails are registered.
      await bcrypt.compare(password, DUMMY_HASH);
      throw new ApiError(401, 'Invalid credentials.');
    }

    // --- Step 3: Check auth provider ---
    // If the user registered via Google, they cannot login with a password.
    if (user.authProvider === 'google') {
      throw new ApiError(401, 'This email is registered with Google. Please sign in with Google.');
    }

    // --- Step 4: Check email verification ---
    if (!user.isEmailVerified) {
      throw new ApiError(401, 'Please verify your email before logging in.');
    }

    // --- Step 5: Check account status ---
    if (!user.isActive) {
      throw new ApiError(403, 'Your account has been disabled. Please contact support.');
    }

    // --- Step 6: Verify password ---
    const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordCorrect) {
      throw new ApiError(401, 'Invalid credentials.');
    }

    // --- Step 7: Generate tokens ---
    const userId = user._id.toString();
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);

    // --- Step 8: Store refresh token in Redis (whitelist) ---
    // EX sets TTL in seconds — do not use milliseconds here
    await redis.set(`refresh_token:${userId}`, refreshToken, 'EX', REFRESH_TOKEN_REDIS_TTL);

    // --- Step 9: Set refresh token as HttpOnly cookie ---
    // HttpOnly: JS cannot read this cookie (XSS safe)
    // secure: only sent over HTTPS in production
    // sameSite: strict — CSRF protection
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
    });

    // --- Step 10: Return access token and safe user object ---
    // Never return passwordHash or other sensitive fields
    console.log('[Auth] Login successful:', cleanEmail);

    return sendResponse(res, 200, {
      message: 'Login successful.',
      data: {
        accessToken,
        user: {
          id: userId,
          name: user.name,
          email: user.email,
          role: user.role,
          plan: user.plan,
        },
      },
    });

  } catch (err) {
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

/**
 * POST /api/v1/auth/logout
 * Invalidates the refresh token and clears the cookie.
 */
export const logout = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();

    try {
      await redis.del(`refresh_token:${userId}`);
    } catch (redisErr) {
      console.error('[Logout] Redis DEL failed:', redisErr);
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return sendResponse(res, 200, { message: 'Logged out successfully.' });

  } catch (err) {
    next(err);
  }
};
