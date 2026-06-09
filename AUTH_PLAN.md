AUTH_PLAN.md — Zuno Authentication System
Overview
This document is the complete authentication plan for Zuno (Bihar Board AI Tutor). It covers User Schema, Endpoints, Redis strategy, Middleware, and implementation order. Every decision in this file has been reviewed and locked.

Implementation Status (updated 2026-06-09)

Done:
* Step 1  — packages installed (bcrypt, jsonwebtoken, ioredis, nodemailer, cookie-parser, express-rate-limit).
* Step 2  — Redis client (backend/src/config/redisClient.js), verified on startup.
* Step 3  — User model (backend/src/models/user.model.js).
* Step 4  — tokenHelpers.js (generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken).
* Step 5  — authMiddleware.js (optionalAuth, requireAuth, requireAdmin).
* Step 6  — register + email verification (auth.controller.js register(), verifyEmail(), emailHelpers.js sendVerificationEmail(), routes wired).
* Step 7  — login endpoint (auth.controller.js login(), POST /login). Bug fixed: sendResponse payload wrapped in data key. Timing-safe dummy hash for user-not-found case.
* Step 8  — logout endpoint (auth.controller.js logout(), POST /logout with requireAuth). Redis DEL refresh_token:<userId>, HttpOnly cookie cleared.
* Step 9  — refresh token endpoint (auth.controller.js refreshToken(), POST /refresh). Reads HttpOnly cookie, verifies JWT, checks Redis whitelist, returns new access token.
* Step 10 — forgot-password + reset-password endpoints (auth.controller.js forgotPassword(), resetPassword(), routes wired). Email-enumeration-safe response. Reset token TTL 15 min. Password reset forces re-login via Redis DEL refresh_token:<userId>.

Plan-vs-code drift to reconcile later (not yet done):
* user.model.js does NOT yet have dailyQueryCount / lastQueryReset — add when query limits (Step 14) are built.
* Google OAuth will use google-auth-library (already installed), not Passport.js as written below.

Steps 11–19 (Google OAuth, /auth/me, rate limiting, query counting, frontend, E2E tests) are still pending.
Tech Stack (Auth-specific)

* JWT — Access Token + Refresh Token pattern
* Redis — Refresh token whitelist + Email/Password reset tokens + Query rate limiting
* bcrypt — Password hashing
* Passport.js — Google OAuth 2.0
* express-rate-limit — Brute force protection on login/register
* nodemailer — Email verification + Password reset emails
User Schema

```js
// backend/src/models/user.model.js

{
  name:             String,   required
  email:            String,   required, unique
  passwordHash:     String,   nullable  // null for Google users
  authProvider:     enum['email', 'google']
  googleId:         String,   nullable  // null for email users
  isEmailVerified:  Boolean,  default: false
  isActive:         Boolean,  default: true
  role:             enum['student', 'admin'],  default: 'student'
  dailyQueryCount:  Number,   default: 0
  lastQueryReset:   Date
  plan:             enum['free', 'pro'],  default: 'free'
  planExpiresAt:    Date,     nullable
  createdAt:        Date      // auto via timestamps: true
  updatedAt:        Date      // auto via timestamps: true
}

```

Key decisions

* passwordHash is nullable — Google users have no password.
* googleId is nullable — email users have no Google ID.
* isEmailVerified is automatically true for Google users.
* isActive: false allows admin to disable a user without deleting their data.
* plan and planExpiresAt are added now to avoid future migration pain.
* dailyQueryCount + lastQueryReset used for query limit enforcement.
Auth Strategy — Dual Provider
Rule: One email = one method
If a user registers via Google, they cannot also register via email+password with the same email. If they try, return: "This email is registered via Google. Please login with Google."
Account linking is deferred — not needed for Zuno MVP.
Endpoints

```
POST   /api/v1/auth/register           Email+Password+Name registration
POST   /api/v1/auth/login              Email+Password login
GET    /api/v1/auth/google             Redirect to Google OAuth consent screen
GET    /api/v1/auth/google/callback    Google OAuth callback handler
POST   /api/v1/auth/logout             Invalidate refresh token in Redis
POST   /api/v1/auth/refresh            Exchange refresh token for new access token
POST   /api/v1/auth/verify-email       Verify email using token from email link
POST   /api/v1/auth/forgot-password    Send password reset email
POST   /api/v1/auth/reset-password     Reset password using token from email link
GET    /api/v1/auth/me                 Get current logged-in user info

```

Flow Diagrams
1. Email+Password Register

```
POST /auth/register  { name, email, password }
  ↓
Validate input (name, email, password required)
  ↓
Check email exists in DB?
  → Yes → 400: "Email already registered"
  ↓
Hash password (bcrypt, saltRounds: 12)
  ↓
Save user to DB (isEmailVerified: false)
  ↓
Generate secure random token (crypto.randomBytes(32).toString('hex'))
  ↓
Store in Redis:
  Key:   verify_email:<token>   Value: userId   TTL: 24 hours
  Key:   verify_email:<userId>  Value: token    TTL: 24 hours
  ↓
Send verification email with link
  ↓
Response: 201 — "Verification email sent. Please check your inbox."

```

2. Email Verification

```
POST /auth/verify-email  { token }
  ↓
Redis GET verify_email:<token>
  → Not found → 400: "Verification link expired or invalid"
  ↓
userId found → DB update: isEmailVerified = true
  ↓
Redis DEL verify_email:<token>
Redis DEL verify_email:<userId>
  ↓
Response: 200 — "Email verified. You can now login."

```

3. Email+Password Login

```
POST /auth/login  { email, password }
  ↓
Find user by email
  → Not found → 401: "Invalid credentials"
  ↓
Check authProvider === 'email'
  → 'google' → 401: "This email is registered via Google. Please login with Google."
  ↓
Check isEmailVerified === true
  → false → 401: "Please verify your email first."
  ↓
Check isActive === true
  → false → 403: "Your account has been disabled. Contact support."
  ↓
bcrypt.compare(password, passwordHash)
  → No match → 401: "Invalid credentials"
  ↓
Generate Access Token (JWT, 15min) + Refresh Token (JWT, 7days)
  ↓
Redis SET refresh_token:<userId> = refreshToken, TTL 7 days
  ↓
Set Refresh Token as HttpOnly Cookie
Return Access Token in response body
  ↓
Response: 200 — { accessToken, user: { id, name, email, role, plan } }

```

4. Google OAuth

```
GET /auth/google → Redirect to Google consent screen

GET /auth/google/callback?code=xxx
  ↓
[Wrap in try-catch — Google API can fail]
  ↓
Exchange code with Google API → get { googleId, email, name }
  ↓
Find user by email in DB
  ↓
  Case A: Found, authProvider === 'google' → proceed to token generation
  Case B: Found, authProvider === 'email' → 400: "This email is registered with password."
  Case C: Not found → Create new user (isEmailVerified: true) → proceed
  ↓
Generate Access Token + Refresh Token
  ↓
Redis SET refresh_token:<userId> = refreshToken, TTL 7 days
  ↓
Set HttpOnly Cookie (refresh token)
Redirect to frontend with access token

```

5. Logout

```
POST /auth/logout
  ↓
Read userId from access token (requireAuth middleware)
  ↓
Redis DEL refresh_token:<userId>
  ↓
Clear HttpOnly Cookie (maxAge: 0)
  ↓
Response: 200 — "Logged out successfully"

```

6. Refresh Token

```
POST /auth/refresh
  ↓
Read refresh token from HttpOnly Cookie
  → No cookie → 401: "No refresh token"
  ↓
Verify JWT signature
  → Invalid → 401: "Invalid refresh token"
  ↓
Extract userId from payload
  ↓
Redis GET refresh_token:<userId>
  → Not found → 401: "Session expired. Please login again."
  → Mismatch → 401: "Invalid session"
  ↓
Generate new Access Token (15min)
  ↓
Response: 200 — { accessToken }

```

7. Forgot Password

```
POST /auth/forgot-password  { email }
  ↓
Find user by email
  → Always respond: "If this email exists, a reset link has been sent."
  ← Same response whether found or not — prevents email enumeration
  ↓
If found AND authProvider === 'email':
  Generate token → Redis SET reset_password:<token> = userId, TTL 15 minutes
  Send reset email

```

8. Reset Password

```
POST /auth/reset-password  { token, newPassword }
  ↓
Validate newPassword (min 8 chars)
  ↓
Redis GET reset_password:<token>
  → Not found → 400: "Reset link expired or invalid"
  ↓
Hash newPassword → DB update passwordHash
  ↓
Redis DEL reset_password:<token>
Redis DEL refresh_token:<userId>   ← force re-login after reset
  ↓
Response: 200 — "Password reset successful. Please login."

```

Redis Key Reference

```
refresh_token:<userId>       →  refreshToken string    TTL: 7 days
verify_email:<token>         →  userId string          TTL: 24 hours
verify_email:<userId>        →  token string           TTL: 24 hours
reset_password:<token>       →  userId string          TTL: 15 minutes
guest_queries:<ip_address>   →  count number           TTL: 24 hours
user_queries:<userId>        →  count number           TTL: 24 hours

```

Token Storage — Frontend

```
Access Token  →  Redux state only (NOT localStorage)
              →  Redux-Persist DISABLED for auth slice
              →  Lost on page refresh — intentional
              →  /auth/refresh restores it silently on app load

Refresh Token →  HttpOnly Cookie (server sets it)
              →  JavaScript cannot access — XSS safe

```

Middleware

```
optionalAuth   →  Token hai → req.user set karo. Nahi hai → req.user = null, continue.
requireAuth    →  optionalAuth + req.user null check → 401 if null
requireAdmin   →  requireAuth + role check → 403 if not admin

```

Rate Limiting

```
Endpoints:  POST /auth/login, POST /auth/register
Window:     15 minutes
Max:        10 requests per IP
Message:    "Too many attempts. Please try again after 15 minutes."
Package:    express-rate-limit

```

Query Limits

```
Guest:          guest_queries:<ip>      limit: GUEST_DAILY_LIMIT (default 5)   TTL: 24h
Logged-in:      user_queries:<userId>   limit: USER_DAILY_LIMIT  (default 20)  TTL: 24h

```

New Environment Variables Required

```
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

REDIS_URL=redis://localhost:6379

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=Zuno <noreply@zuno.com>

FRONTEND_URL=http://localhost:5173

GUEST_DAILY_LIMIT=5
USER_DAILY_LIMIT=20

BCRYPT_SALT_ROUNDS=12

```

New Packages Required

```
Backend:
  bcrypt
  jsonwebtoken
  passport
  passport-google-oauth20
  ioredis
  nodemailer
  express-rate-limit
  cookie-parser

Frontend:
  @reduxjs/toolkit
  react-redux

```

New Files to Create

```
backend/src/
  models/
    user.model.js
  auth/
    authRoutes.js
    authController.js
    authMiddleware.js
    googleStrategy.js
    tokenHelpers.js
    emailHelpers.js
  config/
    redisClient.js
    passportConfig.js

```

Implementation Order

```
Step 1   Install all required packages (backend + frontend)
Step 2   Set up Redis client (redisClient.js) — verify connection
Step 3   Create User model (user.model.js)
Step 4   Create tokenHelpers.js — generateAccessToken, generateRefreshToken
Step 5   Create authMiddleware.js — optionalAuth, requireAuth, requireAdmin
Step 6   Implement register endpoint + email verification flow
Step 7   Implement login endpoint
Step 8   Implement logout endpoint
Step 9   Implement refresh token endpoint
Step 10  Implement forgot-password + reset-password endpoints
Step 11  Implement Google OAuth (passport setup + callback handler)
Step 12  Implement /auth/me endpoint
Step 13  Add rate limiting to login + register
Step 14  Add query counting middleware (guest + logged-in)
Step 15  Frontend: Redux auth slice (no persist), token storage, auto-refresh on load
Step 16  Frontend: Login page, Register page, Google button
Step 17  E2E test: register → verify → login → refresh → logout
Step 18  E2E test: Google login → logout → login again
Step 19  E2E test: forgot password → reset → login

```

Security Checklist

* [x] Passwords never stored in plain text — always bcrypt hashed
* [x] JWT secrets are strong random strings — never hardcoded
* [x] Refresh token in HttpOnly Cookie — not accessible via JS
* [ ] Access token in Redux memory only — not in localStorage  (frontend auth not yet built)
* [x] Same error for "email not found" and "wrong password" — prevents enumeration (timing-safe dummy hash used)
* [x] Same response for forgot-password regardless of email existence
* [x] Email verification tokens are one-time use
* [x] Password reset tokens expire in 15 minutes
* [x] Password reset forces re-login (Redis DEL refresh_token:<userId> on reset)
* [x] isActive check on every login
* [ ] Google OAuth callback wrapped in try-catch  (Step 11 — not yet built)
* [ ] Rate limiting on login + register  (Step 13 — not yet built)
* [x] Redis TTL set on every key
* [x] .env never committed to git
