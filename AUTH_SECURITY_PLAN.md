# Zuno Auth & Security Fix Plan — Pre-Deployment Deep Audit

> **Created:** 2026-06-20
> **Status:** Phase 0 (all findings documented, no fixes started yet)
> **Last session:** All 35 findings catalogued and verified via deep code audit
> **Owner:** Farhan Raza (developer) + Claude (senior engineering advisor)

---

## 0. Read This First (Mandatory Before Any Step)

This file is the **multi-session bridge** for fixing every auth, security, toast, and redirect bug found in the pre-deployment deep audit. It exists because these fixes span ~35 findings across frontend and backend, too many for one session.

**Why this file exists:**
- 35 findings need fixing one-by-one before deployment (Stage 12)
- Without this file, the next session starts cold and re-derives context
- Status tracking here = single source of truth on what's fixed vs pending

**How to use this file in any session:**
1. Read sections 1-3 (Context, Findings Summary, Status Tracker) to refresh
2. Look at the Status Tracker (section 3) to find the next incomplete step
3. Open that step's section, read the full detail
4. Implement that ONE fix. Test. Mark done in Status Tracker.
5. Stop. Next session continues from the next step.

---

## 1. Context Recap — What We're Fixing

### What happened
Full auth system was implemented (JWT access/refresh tokens, Google OAuth, email verification, password reset, Redis whitelist, Axios interceptor with silent refresh). Before deployment, a deep audit was performed covering:
- Every auth endpoint (backend)
- Every auth page (frontend)
- Every redirect flow (where does each action send the user)
- Toast behavior (how notifications work across page transitions)
- Edge cases and race conditions

### What we found (35 total findings)

| Severity | Count | Examples |
|----------|-------|---------|
| Critical | 3 | Session hijacking, token in URL, console.log leak |
| High | 7 | Toast on refresh, login toast lost, full-page reloads, no auth guards |
| Medium | 10 | Double toast, password validation mismatch, race conditions |
| Low | 15 | Missing error codes, keyboard accessibility, autocomplete attributes |

### The user's specific complaints (what triggered the re-audit)
1. **"toast hr refresh krne pe bhi message dikh rha hai"** — Toast reappears on every page refresh
2. **Route redirect flows not thoroughly covered** — Where does each action redirect and how
3. **Small frontend bugs missed** — Every tiny UX issue matters before deployment

### Current auth architecture (for reference)
- **Backend:** JWT access (15m) + refresh (7d HttpOnly cookie) + Redis whitelist
- **Frontend:** Redux authSlice (NOT persisted) + AppInitializer (silent refresh on load)
- **Google OAuth:** Backend redirects to Google → callback → redirects to frontend with access token in URL
- **Session:** localStorage `zuno.sessionId` for chat, no ownership check in Ask pipeline

---

## 2. Complete Redirect Flow Map

This section documents EVERY auth-related navigation in the system — where the user goes, how they get there, and what's broken.

### Flow table (18 scenarios)

| # | Action | From | To | Method | Bug? |
|---|--------|------|----|--------|------|
| 1 | Email login success | /login | / | `navigate('/')` | Toast lost (unmounts before visible) |
| 2 | Email login error | /login | /login | stays on page | OK |
| 3 | Logout | / | /login | `navigate('/login', {state})` | Toast reappears on refresh |
| 4 | Google OAuth success | /auth/callback | / | `navigate('/', {state})` | Toast reappears on refresh |
| 5 | Google OAuth error | /auth/callback | /login | `navigate('/login', {state})` | Toast reappears on refresh |
| 6 | Google OAuth getMe fail | /auth/callback | /login | `setTimeout 2s + navigate` | Toast reappears on refresh |
| 7 | Register success | /register | /register | shows "check email" | Double toast |
| 8 | Register error | /register | /register | stays on page | OK |
| 9 | Verify email success | /verify-email | /login (button) | `navigate('/login')` | OK |
| 10 | Verify email fail | /verify-email | /register (button) | `navigate('/register')` | OK |
| 11 | Forgot password submit | /forgot-password | /forgot-password | shows "email sent" | OK |
| 12 | Reset password success | /reset-password | /login | `setTimeout 3s + navigate` | No toast on login page |
| 13 | Reset password bad token | /reset-password | /forgot-password (button) | `navigate('/forgot-password')` | OK |
| 14 | Topbar "Login" click | / | /login | `window.location.href` | Full page reload |
| 15 | Token refresh failure | any page | /login | `window.location.href` | Full page reload, no message |
| 16 | Logged-in → /login | - | /login | no guard | Should redirect to / |
| 17 | Logged-in → /register | - | /register | no guard | Should redirect to / |
| 18 | Unknown URL | /xyz | / | `<Navigate to="/" replace />` | OK |

---

## 3. Status Tracker (Single Source of Truth)

Update this section as fixes complete. Use `[ ]` for pending, `[~]` for in-progress, `[x]` for done, `[!]` for blocked.

### Phase 1 — Critical Security (MUST fix before deployment)
- [x] Fix 1.1 — Remove `console.log('login response', data)` token leak
- [x] Fix 1.2 — Add session ownership check in Ask pipeline (`step2.loadSession.js`) — **✅ 2026-07-25: re-fixed for real — the corrected check (without `&& userId`) is now applied. See Section 13.2, NEW-1.**
- [x] Fix 1.3 — Document Google OAuth token-in-URL as known tech debt — **✅ 2026-07-25: superseded — fixed for real via code-exchange flow, not just documented. See Section 13.3.**

### Phase 2 — Toast Bugs (User's primary complaint)
- [x] Fix 2.1 — Replace `window.history.replaceState` with `navigate(path, { replace: true, state: null })` in ALL pages — **✅ 2026-07-25: ChatPage.jsx re-fixed to match LoginPage.jsx's correct pattern. See Section 13.2, NEW-2.**
- [x] Fix 2.2 — Remove duplicate `showToast()` in RegisterPage
- [x] Fix 2.3 — Fix login success toast (pass via navigate state, not local showToast)
- [x] Fix 2.4 — Add `toastError` handler to ChatPage (currently only reads `toastSuccess`)
- [x] Fix 2.5 — Fix VerifyEmailPage useEffect dependency (`[showToast]` → `[]`)

### Phase 3 — Navigation & Route Guards
- [x] Fix 3.1 — Topbar Login: change `window.location.href` → `navigate('/login')`
- [x] Fix 3.2 — Axios interceptor: replace `window.location.href = '/login'` with SPA-safe redirect + "session expired" message
- [x] Fix 3.3 — Create `GuestOnlyRoute` component, wrap /login and /register
- [x] Fix 3.4 — Fix AppInitializer + AuthCallback race condition (skip refresh on /auth/callback)

### Phase 4 — UX Polish
- [x] Fix 4.1 — Branded loading screen (replace plain "Loading..." text)
- [x] Fix 4.2 — ForgotPassword: add `|| !!emailError` to `isDisabled` check
- [x] Fix 4.3 — Add "session expired" message when redirected to login from axios interceptor
- [x] Fix 4.4 — Reset password success: pass toast to /login via navigate state
- [x] Fix 4.5 — AuthCallback: use auth-page styling instead of inline styles
- [x] Fix 4.6 — Add `autocomplete` attributes to all auth form fields
- [x] Fix 4.7 — Disable Google OAuth button during form submission (loading state)
- [x] Fix 4.8 — Fix `<a role="button">` keyboard accessibility (add tabIndex + onKeyDown)

### Phase 5 — Backend Hardening
- [x] Fix 5.1 — Unify password validation (backend: add number + uppercase requirement)
- [x] Fix 5.2 — ResetPasswordPage: match RegisterPage's password validation rules
- [x] Fix 5.3 — Add missing AuthCallback error codes (`google_cancelled`, `account_disabled`)
- [x] Fix 5.4 — LoginPage: use user data from login response instead of extra `getMe()` call
- [x] Fix 5.5 — Add refresh token rotation in `refreshToken()` endpoint

### Phase 6 — Low Priority (Fix if time allows before deployment)
- [x] Fix 6.1 — `fetchSessions`: distinguish auth errors from real failures (stop silent swallow)
- [x] Fix 6.2 — `fetchSessionHistory`: same as 6.1
- [x] Fix 6.3 — Clear old `sessionId` from localStorage on login (cross-user edge case)
- [x] Fix 6.4 — AppInitializer: don't retry on 403 (disabled account)
- [x] Fix 6.5 — Logout: also clear `zuno-guest-id` from localStorage
- [ ] Fix 6.6 — UX-03: Theme toggle on auth pages (optional — cosmetic)

---

## 4. Critical Rules (Hard Stops)

| Rule | Why | When enforced |
|------|-----|---------------|
| Phase 1 MUST complete before deployment | Session hijacking = data leak between users | Always |
| Test each fix in isolation before moving on | Cascading failures possible in auth code | Always |
| Never store tokens in localStorage | XSS vulnerability — auth state is in Redux (not persisted) by design | Always |
| Don't break existing cookie/Redis flow | Silent refresh + token rotation must keep working | Phase 5 |
| One fix at a time, test, mark done | Multi-session safety | Always |

---

## 5. Phase 1 — Critical Security

### Phase Goal
Fix the 3 findings that are genuinely dangerous before any deployment.

### Total Estimated Effort: 30 minutes

---

### Fix 1.1 — Remove console.log token leak

**Severity:** Critical
**What:** `console.log('login response', data)` at LoginPage.jsx:81 logs the full API response including the JWT access token to the browser console. Anyone with devtools open or a console-reading browser extension can capture it.

**Where:**
- [frontend/src/pages/LoginPage.jsx:81](frontend/src/pages/LoginPage.jsx)

**How:**
Delete the entire line:
```
console.log('login response', data);
```

**Edge cases:** None — pure deletion.

**Test plan:**
1. Login with email/password
2. Open browser devtools → Console tab
3. Confirm no login response or token appears in console output

**Rollback:** Re-add the line (but why would you).

**Completion criteria:**
- Line deleted
- No token visible in browser console after login

**Effort:** 1 minute.

---

### Fix 1.2 — Add session ownership check in Ask pipeline

**Severity:** Critical
**What:** `step2.loadSession.js` loads any session by ID without checking if the requesting user owns it. A malicious user can send another user's `sessionId` in the Ask API request body and:
- Read their entire conversation history
- Inject messages into their session
- See their study progress

The `askOrchestrator.js` receives `userId` from the controller (via `req.user?.id` in `optionalAuth`) but never passes it to `loadSession` for verification.

**Where:**
- [backend/src/ask/step2.loadSession.js:14](backend/src/ask/step2.loadSession.js) — add `userId` parameter
- [backend/src/ask/askOrchestrator.js](backend/src/ask/askOrchestrator.js) — pass `userId` to `loadSession`

**How:**

In `step2.loadSession.js`, add `userId` to function signature and ownership check after loading `dbSession`:

```js
export const loadSession = async ({ requestedSessionId, userId, studyMode, focusChapter }) => {
  // ... existing code ...

  // After dbSession is loaded (around line 31):
  if (dbSession) {
    // Ownership check: if session has a userId and it doesn't match the requester, reject
    const sessionOwner = dbSession.userId?.toString();
    if (sessionOwner && userId && sessionOwner !== userId) {
      throw new ApiError(403, 'Yeh session aapka nahi hai.');
    }
    // ... rest of existing code ...
  }
};
```

In `askOrchestrator.js`, pass `userId` when calling `loadSession`:

```js
const session = await loadSession({
  requestedSessionId: sessionId,
  userId,  // ← add this
  studyMode,
  focusChapter,
});
```

**Edge cases:**
- **Guest users (userId = null):** Guest sessions have `userId: null` in MongoDB. The check `sessionOwner && userId && sessionOwner !== userId` only fires when BOTH session has an owner AND requester has an ID. Guest accessing guest session = no check = OK.
- **Guest accessing logged-in user's session:** `sessionOwner` is truthy but `userId` is null → check doesn't fire → guest CAN access? NO — we should tighten: if session has an owner, requester MUST have the same userId. Fix: `if (sessionOwner && sessionOwner !== userId)` (removes the `userId &&` condition).
- **New session (dbSession is null):** No check needed — new sessions are created fresh.
- **Race condition:** User A creates session, User B sends request with that sessionId before it's saved — session doesn't exist yet → treated as new. Harmless.

**Corrected check (handles guest edge case):**
```js
if (sessionOwner && sessionOwner !== userId) {
  throw new ApiError(403, 'Yeh session aapka nahi hai.');
}
```

This means:
- Session has owner, requester is same user → pass ✅
- Session has owner, requester is different user → block ❌
- Session has owner, requester is guest (null) → block ❌
- Session has no owner (guest session), anyone → pass ✅ (guest sessions are anonymous by design)

**Hidden risks:**
- Existing guest sessions in MongoDB have `userId: null`. After this fix, a guest user can still use their own session (no owner = no check). But if they later log in AND the session has been retroactively assigned a userId, they need to use the auth token. This is correct behavior.

**Test plan:**
1. Login as User A → send a question → note the sessionId from the response
2. Login as User B → send a question with User A's sessionId → expect 403 error
3. As a guest → send a question → should work (new session, no owner)
4. As a guest → send a question with User A's sessionId → expect 403
5. As User A → send a question with User A's own sessionId → should work

**Rollback:** Remove the ownership check from `step2.loadSession.js`, remove `userId` from the call in orchestrator.

**Completion criteria:**
- Ownership check exists in step2
- Cross-user session access returns 403
- Own-user session access works normally
- Guest sessions still work

**Effort:** 15 minutes.

---

### Fix 1.3 — Document Google OAuth token-in-URL as known tech debt

**Severity:** Critical (but complex fix — documenting for now)
**What:** `googleCallback` in `auth.controller.js:523` redirects to `FRONTEND_URL/auth/callback?token=ACCESS_TOKEN`. The JWT access token appears in the URL bar, browser history, server logs, and referrer headers.

**Why not fixing now:**
The proper fix requires an authorization code exchange flow:
1. Backend generates a one-time code (stored in Redis, 30-second TTL)
2. Redirects to frontend with `?code=ONE_TIME_CODE` (not the token)
3. Frontend exchanges code for access token via `POST /auth/exchange`

This is a significant refactor affecting both backend (new endpoint) and frontend (AuthCallback rewrite). For MVP deployment with a small user base and short token TTL (15 minutes), the current approach is acceptable risk.

**Mitigating factors:**
- Access token TTL is 15 minutes (short window for exploitation)
- AuthCallback clears the URL via `window.history.replaceState` immediately
- The redirect is server-to-client (not logged by proxies as a GET parameter in most setups)

**Where to document:**
Add a `TODO` comment in `auth.controller.js:523` and a note in DECISIONS.md.

**How:**
In `auth.controller.js:523`:
```js
// TODO(security): access token is in URL — switch to authorization code exchange before scaling
return res.redirect(`${FRONTEND_URL}/auth/callback?token=${accessToken}`);
```

**Completion criteria:**
- Comment added in code
- Decision logged in section 8 (Decisions Log) of this file

**Effort:** 5 minutes.

---

### Phase 1 Exit Criteria
- [ ] No access token appears in browser console after login
- [ ] Cross-user session access returns 403
- [ ] Own-user session access unaffected
- [ ] Guest sessions unaffected
- [ ] Google OAuth token-in-URL documented as tech debt

---

## 6. Phase 2 — Toast Bugs

### Phase Goal
Fix the toast system so toasts show when they should, don't show when they shouldn't, and never duplicate.

### Total Estimated Effort: 45 minutes

---

### Fix 2.1 — Replace `window.history.replaceState` with React Router `navigate` in ALL pages

**Severity:** High
**What:** The pattern `window.history.replaceState({}, '', location.pathname)` is used to clear `location.state` after showing a toast. This modifies the browser's native history state but does NOT synchronize with React Router v6's internal state management.

**Root cause explained:**
React Router v6 stores state as `window.history.state.usr` along with internal tracking keys (`key`, `idx`). When you call raw `replaceState({}, '', path)`:
1. It wipes `usr` (the state) ✅
2. It ALSO wipes `key` and `idx` (React Router's internal tracking) ❌
3. React Router's in-memory `location` object still has the old state until a navigation occurs
4. On page refresh, the browser MAY restore stale session history state depending on browser implementation

**The correct fix:** Use `navigate(location.pathname, { replace: true, state: null })`. This:
1. Goes through React Router's own history management
2. Properly clears `usr` while preserving `key` and `idx`
3. Synchronizes both browser and React Router internal state
4. Prevents stale state on refresh

**Where (all 3 locations):**

**Location 1: LoginPage.jsx:44-51**
```js
// BEFORE:
useEffect(() => {
  if (location.state?.toastError) {
    showToast(location.state.toastError, 'error');
    window.history.replaceState({}, '', location.pathname);
  } else if (location.state?.toastSuccess) {
    showToast(location.state.toastSuccess, 'success');
    window.history.replaceState({}, '', location.pathname);
  }
}, []);

// AFTER:
useEffect(() => {
  if (location.state?.toastError) {
    showToast(location.state.toastError, 'error');
  } else if (location.state?.toastSuccess) {
    showToast(location.state.toastSuccess, 'success');
  }
  if (location.state) {
    navigate(location.pathname, { replace: true, state: null });
  }
}, []);
```

**Location 2: ChatPage.jsx:82-86**
```js
// BEFORE:
useEffect(() => {
  if (location.state?.toastSuccess) {
    showToast(location.state.toastSuccess, 'success');
    window.history.replaceState({}, '', location.pathname);
  }
}, []);

// AFTER:
useEffect(() => {
  if (location.state?.toastSuccess) {
    showToast(location.state.toastSuccess, 'success');
  } else if (location.state?.toastError) {
    showToast(location.state.toastError, 'error');
  }
  if (location.state) {
    navigate(location.pathname, { replace: true, state: null });
  }
}, []);
```
Note: This also adds `toastError` handling to ChatPage (covers Fix 2.4).

**Location 3: AuthCallback.jsx:40**
```js
// BEFORE:
window.history.replaceState({}, '', '/auth/callback');
navigate('/', { state: { toastSuccess: 'Google se login successful!' } });

// AFTER:
navigate('/', { state: { toastSuccess: 'Google se login successful!' }, replace: true });
```
Note: `replace: true` prevents user from navigating "back" to `/auth/callback?token=...` which would be a dead page. The token is already consumed.

**Edge cases:**
- `navigate()` with `replace: true` + `state: null` causes a re-render but NOT a component remount. The `useEffect([], [])` won't fire again.
- If `navigate` is not available in scope (ChatPage): it already uses `useLocation()` but doesn't import `useNavigate`. Need to add `const navigate = useNavigate();` import.
- Multiple state keys: if both `toastSuccess` and `toastError` exist (shouldn't happen, but defensive), the `if/else if` ensures only one fires.

**Hidden risks:**
- `navigate(path, { replace: true, state: null })` triggers React Router's `popstate` handler. In StrictMode (dev), this could cause a brief double-render. Harmless — toast only shows once because `useEffect` is mount-only.

**Test plan:**
1. Logout → login page → see "Logout ho gaya!" toast → refresh page → NO toast on refresh ✅
2. Google OAuth login → ChatPage → see "Google se login successful!" toast → refresh → NO toast ✅
3. Google OAuth error → login page → see error toast → refresh → NO toast ✅
4. Verify browser back button still works correctly after toast clear

**Rollback:** Revert to `window.history.replaceState` in all 3 locations.

**Completion criteria:**
- Toast shows once after the triggering action
- Toast does NOT reappear on page refresh
- Browser back/forward navigation still works
- No console errors

**Effort:** 15 minutes.

---

### Fix 2.2 — Remove duplicate showToast in RegisterPage

**Severity:** Medium
**What:** `showToast('Verification email sent!...')` is called twice — once at line 103 and again at line 105. User sees two identical success toasts.

**Where:**
- [frontend/src/pages/RegisterPage.jsx:103-105](frontend/src/pages/RegisterPage.jsx)

**How:**
```js
// BEFORE (lines 101-105):
await registerUser({ name: name.trim(), email: email.trim(), password });
showToast('Verification email sent! Please check your inbox.', 'success');
setSubmitted(true);
showToast('Verification email sent! Please check your inbox.', 'success');

// AFTER:
await registerUser({ name: name.trim(), email: email.trim(), password });
setSubmitted(true);
showToast('Verification email sent! Please check your inbox.', 'success');
```

Delete line 103 (the first `showToast` call). Keep the one AFTER `setSubmitted(true)` so the toast is visible on the "Check your email" screen.

**Edge cases:** None.

**Test plan:**
1. Register a new account
2. Verify only ONE toast appears (not two rapid-fire)

**Rollback:** Re-add the deleted line.

**Completion criteria:**
- Only one toast on successful registration
- Toast appears on the "Check your email" screen

**Effort:** 1 minute.

---

### Fix 2.3 — Fix login success toast (pass via navigate state)

**Severity:** High
**What:** After successful email login, `showToast('Logged in successfully')` fires on LoginPage's local `useToast()` state. Then `navigate('/')` immediately unmounts LoginPage — the Toast Snackbar component dies with it. User never sees any success confirmation.

**Where:**
- [frontend/src/pages/LoginPage.jsx:85-86](frontend/src/pages/LoginPage.jsx)

**How:**
```js
// BEFORE (lines 85-86):
showToast('Logged in successfully', 'success');
navigate('/');

// AFTER:
navigate('/', { state: { toastSuccess: 'Login successful!' } });
```

Remove the `showToast` call — the toast will be shown by ChatPage's `useEffect` (which reads `location.state.toastSuccess`). This was already set up in ChatPage.jsx:82-86 (and enhanced in Fix 2.1).

**Edge cases:**
- Fix 2.1 must be applied first (or simultaneously) — ChatPage needs the `navigate(path, { replace: true, state: null })` pattern to clear the state after showing.

**Test plan:**
1. Login with email/password
2. Should see "Login successful!" toast on ChatPage after redirect ✅
3. Refresh ChatPage → NO toast ✅

**Rollback:** Revert to `showToast` + `navigate('/')`.

**Completion criteria:**
- User sees success toast after email login
- Toast appears on ChatPage (the destination), not on LoginPage (which unmounts)

**Effort:** 2 minutes.

---

### Fix 2.4 — Add toastError handler to ChatPage

**Severity:** Low
**What:** ChatPage's `useEffect` only checks `location.state?.toastSuccess`. If any flow passes `toastError` via navigation to `/`, it would be silently ignored.

**Where:**
- [frontend/src/pages/ChatPage.jsx:82-86](frontend/src/pages/ChatPage.jsx)

**How:** Already covered in Fix 2.1 (ChatPage Location 2). The enhanced `useEffect` reads both `toastSuccess` and `toastError`.

**Completion criteria:**
- ChatPage shows both success and error toasts from navigation state

**Effort:** 0 minutes (done as part of Fix 2.1).

---

### Fix 2.5 — Fix VerifyEmailPage useEffect dependency

**Severity:** Low
**What:** `useEffect` at VerifyEmailPage.jsx:38 has `[showToast]` as dependency instead of `[]`. Since `showToast` from `useToast` is wrapped in `useCallback([])`, it IS referentially stable — so this doesn't cause a re-fire in practice. But it's wrong intent.

**Where:**
- [frontend/src/pages/VerifyEmailPage.jsx:38](frontend/src/pages/VerifyEmailPage.jsx)

**How:**
```js
// BEFORE:
}, [showToast]);

// AFTER:
}, []);
```

**Edge cases:** None — `showToast` is already stable.

**Test plan:**
1. Visit /verify-email?token=VALID_TOKEN → should verify once (not twice)
2. Check React DevTools for unnecessary re-renders

**Rollback:** Re-add `[showToast]`.

**Completion criteria:**
- Dependency array is `[]`
- Verification API called only once on mount

**Effort:** 1 minute.

---

### Phase 2 Exit Criteria
- [ ] Toast does NOT reappear on page refresh (tested on 4 flows: logout, Google login, Google error, Google getMe fail)
- [ ] Only ONE toast on successful registration
- [ ] Login success toast visible to user on ChatPage
- [ ] ChatPage handles both toastSuccess and toastError
- [ ] VerifyEmailPage effect has correct dependency

---

## 7. Phase 3 — Navigation & Route Guards

### Phase Goal
Fix all incorrect navigation methods (full page reloads where SPA navigation should be used) and add route guards.

### Total Estimated Effort: 1 hour

---

### Fix 3.1 — Topbar Login: `window.location.href` → `navigate()`

**Severity:** High
**What:** Topbar.jsx:304 uses `window.location.href = '/login'` which does a full browser navigation. This kills all React state, restarts AppInitializer (flashes "Loading..."), and loses any in-progress chat messages.

**Where:**
- [frontend/src/components/Topbar.jsx:304](frontend/src/components/Topbar.jsx)

**How:**
```js
// BEFORE:
onClick={() => { window.location.href = '/login'; }}

// AFTER:
onClick={() => navigate('/login')}
```

`navigate` is already imported and available in Topbar (line 12: `import { useNavigate } from 'react-router-dom'`, line 31: `const navigate = useNavigate()`).

**Edge cases:** None — `navigate` is already used elsewhere in Topbar (line 56 for logout).

**Test plan:**
1. As a guest on ChatPage, click Login button in Topbar
2. Should navigate to /login WITHOUT page reload (no flash, no "Loading..." text)
3. Browser back button should return to ChatPage with state intact

**Rollback:** Revert to `window.location.href`.

**Completion criteria:**
- Login button uses SPA navigation
- No page reload flash
- State preserved on back navigation

**Effort:** 1 minute.

---

### Fix 3.2 — Axios interceptor: SPA-safe redirect on refresh failure

**Severity:** High
**What:** When silent token refresh fails during normal usage (token expired, Redis cleared, etc.), `axiosInstance.js:99` does `window.location.href = '/login'`. This is a full page reload that destroys all state. User sees a blank page then login form with no explanation.

**Where:**
- [frontend/src/services/axios/axiosInstance.js:96-100](frontend/src/services/axios/axiosInstance.js)

**How:**
The challenge is that axiosInstance is outside the React tree — it can't use `useNavigate()`. We have two options:

**Option A (recommended): dispatch clearCredentials + let React handle it**
```js
// BEFORE (lines 96-100):
} catch (refreshError) {
  processQueue(refreshError, null);
  storeRef?.dispatch(clearCredentials());
  window.location.href = '/login';
  return Promise.reject(refreshError);
}

// AFTER:
} catch (refreshError) {
  processQueue(refreshError, null);
  storeRef?.dispatch(clearCredentials());
  // Store redirect message for LoginPage to pick up
  sessionStorage.setItem('zuno.authRedirect', 'Session expire ho gayi. Please login karo.');
  // Don't hard-redirect — clearCredentials sets isLoggedIn=false
  // React components will re-render accordingly
  return Promise.reject(refreshError);
}
```

Then in LoginPage, read the redirect message on mount:
```js
useEffect(() => {
  const redirectMsg = sessionStorage.getItem('zuno.authRedirect');
  if (redirectMsg) {
    showToast(redirectMsg, 'error');
    sessionStorage.removeItem('zuno.authRedirect');
  }
  // ... existing location.state toast logic
}, []);
```

**Why Option A:** Removes the hard redirect. After `clearCredentials()`, `selectIsLoggedIn` returns `false`. Any component checking `isLoggedIn` re-renders. The ask API call that triggered the 401 gets the error, ChatPage shows error message. User is still on ChatPage as a guest. They can click Login in Topbar (which, after Fix 3.1, uses `navigate`).

**Why not full redirect:** A user mid-conversation shouldn't be yanked to login page. Their messages are still on screen. They can re-login via Topbar and continue.

**Edge cases:**
- Multiple concurrent 401s: `processQueue` handles this — all get rejected, only one refresh attempt runs.
- `sessionStorage` is per-tab: multiple tabs won't cross-contaminate.
- User refreshes after `clearCredentials`: AppInitializer tries silent refresh → fails → guest mode. The sessionStorage message survives refresh and shows on next login page visit.

**Hidden risks:**
- Removing `window.location.href = '/login'` means user stays on current page as "guest." If the current page requires auth (e.g., session history), the API calls will fail but `fetchSessions` silently returns empty. This is acceptable for now.
- If the user was on an auth-required page that doesn't exist yet (future feature), they'd see an error. Not a current concern.

**Test plan:**
1. Login → start chatting → manually expire the refresh token in Redis (`redis-cli DEL refresh_token:USERID`)
2. Send a message → should see error message in chat (API call fails)
3. User should NOT be yanked to login page
4. Click Login in Topbar → navigate to login → see "Session expire ho gayi" toast
5. Login again → back to ChatPage

**Rollback:** Re-add `window.location.href = '/login'`.

**Completion criteria:**
- No full page reload on token expiry
- User stays on current page as guest
- "Session expired" message visible when they reach login page

**Effort:** 20 minutes.

---

### Fix 3.3 — Create GuestOnlyRoute component

**Severity:** Medium
**What:** Logged-in users can visit /login and /register. There's no redirect to `/`. This is confusing UX — a logged-in user sees a login form.

**Where:**
- New component: `frontend/src/components/GuestOnlyRoute.jsx`
- [frontend/src/App.jsx:44-45](frontend/src/App.jsx) — wrap /login and /register routes

**How:**

Create `frontend/src/components/GuestOnlyRoute.jsx`:
```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function GuestOnlyRoute({ children }) {
  const { isLoggedIn } = useAuth();
  if (isLoggedIn) return <Navigate to="/" replace />;
  return children;
}
```

Update `App.jsx`:
```jsx
import GuestOnlyRoute from './components/GuestOnlyRoute.jsx';

// In Routes:
<Route path="/login" element={<GuestOnlyRoute><LoginPage /></GuestOnlyRoute>} />
<Route path="/register" element={<GuestOnlyRoute><RegisterPage /></GuestOnlyRoute>} />
```

**Edge cases:**
- `isLoading = true` during AppInitializer: `isLoggedIn` is `false` because `accessToken` is `null`. GuestOnlyRoute would let them through. This is fine — after AppInitializer completes and sets credentials, React re-renders, and GuestOnlyRoute redirects to `/`.
- Wait, actually: if `isLoading` is `true`, App.jsx shows "Loading..." (line 21-35) and doesn't render Routes at all. So GuestOnlyRoute never runs during loading. Correct.
- Google OAuth: user clicks "Continue with Google" → full page navigation to backend → comes back to `/auth/callback`. AuthCallback is NOT wrapped in GuestOnlyRoute (it should stay accessible regardless).

**Hidden risks:**
- Deep-linked auth pages: if someone sends a link to `/login` to a logged-in user, they get redirected to `/`. This is correct behavior.

**Test plan:**
1. Login → manually navigate to `/login` → should redirect to `/` immediately
2. Login → manually navigate to `/register` → should redirect to `/`
3. Not logged in → navigate to `/login` → should see login form normally
4. Not logged in → navigate to `/register` → should see register form normally

**Rollback:** Remove GuestOnlyRoute component and unwrap routes in App.jsx.

**Completion criteria:**
- Logged-in users redirected from /login and /register to /
- Guest users see auth pages normally
- Auth callback route not affected

**Effort:** 10 minutes.

---

### Fix 3.4 — Fix AppInitializer + AuthCallback race condition

**Severity:** Medium
**What:** When user arrives at `/auth/callback?token=...` after Google OAuth, two things run simultaneously:
1. AppInitializer → calls `refreshAccessToken()` → likely fails (cookie might not be set yet)
2. AuthCallback → reads token from URL → calls `getMe()` → dispatches `setCredentials`

If AppInitializer's second retry (after 500ms delay) runs AFTER AuthCallback's `setCredentials`, it dispatches `clearCredentials` — user gets logged out immediately after Google login appeared to succeed.

**Where:**
- [frontend/src/components/AppInitializer.jsx](frontend/src/components/AppInitializer.jsx)

**How:**
Skip the silent refresh if the current URL is the auth callback page:
```js
// At the start of init():
const init = async () => {
  // Skip silent refresh on auth callback page — AuthCallback handles its own auth
  if (window.location.pathname === '/auth/callback') {
    if (isMounted) dispatch(setLoading(false));
    return;
  }
  // ... existing try/catch refresh logic
};
```

**Edge cases:**
- User bookmarks `/auth/callback` (without query params): AppInitializer skips, AuthCallback sees no token → redirects to `/login`. Correct.
- User refreshes on `/auth/callback` after Google login: AppInitializer skips, AuthCallback sees no token (cleared by previous visit) → redirects to `/login`. Correct — they'll need to login again.

**Hidden risks:**
- Pattern matching on `window.location.pathname` is fragile if the route changes. But `/auth/callback` is defined in backend's Google OAuth config — it won't change without a coordinated update.

**Test plan:**
1. Login via Google → should land on ChatPage with success toast ✅
2. No flash of "Loading..." followed by immediate logout
3. Refresh on ChatPage → AppInitializer runs normally (not on /auth/callback) → silent refresh works

**Rollback:** Remove the pathname check.

**Completion criteria:**
- Google OAuth login works reliably without timing dependency
- AppInitializer skips on /auth/callback
- Normal pages still get silent refresh

**Effort:** 5 minutes.

---

### Phase 3 Exit Criteria
- [ ] Topbar Login button uses SPA navigation (no page reload)
- [ ] Token expiry doesn't cause full page reload
- [ ] Logged-in users redirected from /login and /register to /
- [ ] Google OAuth login works without AppInitializer race condition
- [ ] Browser back/forward navigation works correctly

---

## 8. Phase 4 — UX Polish

### Phase Goal
Fix small frontend bugs that affect the user experience on auth pages.

### Total Estimated Effort: 1.5 hours

---

### Fix 4.1 — Branded loading screen

**What:** Replace plain "Loading..." text in App.jsx:21-35 with Zuno-branded splash screen.

**Where:** [frontend/src/App.jsx:21-35](frontend/src/App.jsx)

**How:**
```jsx
if (isLoading) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-page)',
      gap: '12px',
    }}>
      <div className="zuno-logo" style={{ width: 48, height: 48, fontSize: '1.5rem' }}>Z</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</div>
    </div>
  );
}
```

**Effort:** 5 minutes.

---

### Fix 4.2 — ForgotPassword isDisabled check

**What:** Button stays enabled when email validation error is shown.

**Where:** [frontend/src/pages/ForgotPasswordPage.jsx:37](frontend/src/pages/ForgotPasswordPage.jsx)

**How:**
```js
// BEFORE:
const isDisabled = !email.trim() || loading;

// AFTER:
const isDisabled = !email.trim() || !!emailError || loading;
```

**Effort:** 1 minute.

---

### Fix 4.3 — "Session expired" message on login page

**What:** When user is redirected to login after token expiry, show a toast explaining what happened.

**Where:** [frontend/src/pages/LoginPage.jsx](frontend/src/pages/LoginPage.jsx) (reads from sessionStorage set by Fix 3.2)

**How:** Already described in Fix 3.2. LoginPage reads `sessionStorage.getItem('zuno.authRedirect')` on mount.

**Effort:** 0 minutes (done as part of Fix 3.2).

---

### Fix 4.4 — Reset password success toast on login page

**What:** After successful password reset, user is auto-redirected to /login in 3 seconds. No toast or feedback on the login page.

**Where:** [frontend/src/pages/ResetPasswordPage.jsx:64-66](frontend/src/pages/ResetPasswordPage.jsx)

**How:**
```js
// BEFORE:
const timer = setTimeout(() => navigate('/login'), 3000);

// AFTER:
const timer = setTimeout(() => {
  navigate('/login', { state: { toastSuccess: 'Password reset ho gaya! Ab login karo.' } });
}, 3000);
```

**Effort:** 2 minutes.

---

### Fix 4.5 — AuthCallback styling

**What:** AuthCallback shows bare unstyled `<p>` with hardcoded `color: '#ccc'`. Doesn't match auth page theme.

**Where:** [frontend/src/pages/AuthCallback.jsx:56-60](frontend/src/pages/AuthCallback.jsx)

**How:**
Replace the return JSX with the same `auth-page` + `auth-card` pattern used by all other auth pages:
```jsx
return (
  <div className="auth-page">
    <div className="auth-card">
      <div className="auth-logo-row">
        <div className="zuno-logo">Z</div>
        <span className="auth-logo-text">Zuno</span>
      </div>
      <p className="auth-subtext">{statusText}</p>
    </div>
  </div>
);
```

**Effort:** 5 minutes.

---

### Fix 4.6 — Add autocomplete attributes to auth forms

**What:** No `autoComplete` attributes on auth form fields. Password managers may not auto-detect fields correctly.

**Where:**
- LoginPage.jsx: email → `autoComplete="email"`, password → `autoComplete="current-password"`
- RegisterPage.jsx: name → `autoComplete="name"`, email → `autoComplete="email"`, password → `autoComplete="new-password"`
- ResetPasswordPage.jsx: new password → `autoComplete="new-password"`, confirm → `autoComplete="new-password"`

**How:** Add `autoComplete` prop to each `<TextField>` component.

**Effort:** 10 minutes.

---

### Fix 4.7 — Disable Google button during form submission

**What:** While email login/register form is submitting, the Google OAuth button remains enabled. User could click it mid-submission.

**Where:**
- [frontend/src/pages/LoginPage.jsx:195-218](frontend/src/pages/LoginPage.jsx)
- [frontend/src/pages/RegisterPage.jsx:254-278](frontend/src/pages/RegisterPage.jsx)

**How:** Add `disabled={loading}` to Google OAuth `<Button>`.

**Effort:** 2 minutes.

---

### Fix 4.8 — Keyboard accessibility for auth links

**What:** `<a role="button" onClick={...}>` elements are not keyboard-accessible. Missing `tabIndex` and `onKeyDown`.

**Where:**
- LoginPage.jsx:222 ("Don't have an account? Sign up")
- RegisterPage.jsx:281 ("Already have an account? Sign in")
- ForgotPasswordPage.jsx:74 ("Back to login")
- ForgotPasswordPage.jsx:136 ("Back to login")
- RegisterPage.jsx:130 ("Go to login →")

**How:** Add `tabIndex={0}` and `onKeyDown` handler, or better — use `<span>` with proper cursor/styling since these aren't real links:
```jsx
<a
  role="button"
  tabIndex={0}
  onClick={() => navigate('/login')}
  onKeyDown={(e) => e.key === 'Enter' && navigate('/login')}
>
  Sign in
</a>
```

**Effort:** 15 minutes (5 locations).

---

### Phase 4 Exit Criteria
- [ ] Branded loading screen visible during app initialization
- [ ] ForgotPassword button disabled when email is invalid
- [ ] "Session expired" toast shown on login page after forced logout
- [ ] Reset password success leads to toast on login page
- [ ] AuthCallback matches other auth page styling
- [ ] All auth fields have autocomplete attributes
- [ ] Google button disabled during form submission
- [ ] All auth links keyboard-accessible

---

## 9. Phase 5 — Backend Hardening

### Phase Goal
Fix validation mismatches, missing error codes, and unnecessary API calls.

### Total Estimated Effort: 1.5 hours

---

### Fix 5.1 — Unify password validation in backend

**What:** Backend only validates password length (8+ chars). Frontend's RegisterPage also requires 1 number and 1 uppercase. A direct API call or ResetPasswordPage bypasses the stricter rules.

**Where:** [backend/src/controllers/auth.controller.js:39-41](backend/src/controllers/auth.controller.js) (register) and line 369-371 (resetPassword)

**How:**
```js
// Add to both register() and resetPassword():
if (password.length < 8) {
  throw new ApiError(400, 'Password kam se kam 8 characters ka hona chahiye.');
}
if (!/\d/.test(password)) {
  throw new ApiError(400, 'Password mein kam se kam ek number hona chahiye.');
}
if (!/[A-Z]/.test(password)) {
  throw new ApiError(400, 'Password mein kam se kam ek uppercase letter hona chahiye.');
}
```

**Effort:** 10 minutes.

---

### Fix 5.2 — Match ResetPasswordPage validation with RegisterPage

**What:** ResetPasswordPage only checks 8+ chars. RegisterPage checks 8+ chars, 1 number, 1 uppercase.

**Where:** [frontend/src/pages/ResetPasswordPage.jsx:27-30](frontend/src/pages/ResetPasswordPage.jsx)

**How:**
```js
// BEFORE:
function validateNewPassword(value) {
  if (!value) return 'New password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  return '';
}

// AFTER:
function validateNewPassword(value) {
  if (!value) return 'New password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (!/\d/.test(value)) return 'Password must contain at least one number';
  if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
  return '';
}
```

**Effort:** 5 minutes.

---

### Fix 5.3 — Add missing AuthCallback error codes

**What:** Backend sends `google_cancelled` and `account_disabled` error codes that AuthCallback doesn't map.

**Where:** [frontend/src/pages/AuthCallback.jsx:8-11](frontend/src/pages/AuthCallback.jsx)

**How:**
```js
const ERROR_MESSAGES = {
  account_exists: 'Yeh email already registered hai. Please login karo.',
  google_failed: 'Google sign-in fail hua. Please dobara try karo.',
  google_cancelled: 'Google sign-in cancel ho gaya. Dobara try karo.',
  account_disabled: 'Aapka account disabled hai. Support se contact karo.',
};
```

**Effort:** 2 minutes.

---

### Fix 5.4 — Use login response user data instead of extra getMe() call

**What:** Backend login response already includes `data.user` with id, name, email, role, plan. LoginPage extracts only the access token and makes a separate `getMe()` API call — wasting one request.

**Where:** [frontend/src/pages/LoginPage.jsx:80-84](frontend/src/pages/LoginPage.jsx)

**How:**
```js
// BEFORE:
const data = await loginUser({ email: email.trim(), password });
console.log('login response', data);  // ← already deleted in Fix 1.1
const accessToken = data.data?.accessToken || data.accessToken;
const user = await getMe(accessToken);
dispatch(setCredentials({ user, accessToken }));

// AFTER:
const data = await loginUser({ email: email.trim(), password });
const accessToken = data.data?.accessToken || data.accessToken;
const user = data.data?.user;
dispatch(setCredentials({ user, accessToken }));
```

**Edge cases:**
- `data.data.user` is already the safe object (id, name, email, role, plan) — same shape as `getMe()` returns.
- If for some reason `data.data.user` is undefined, user would be `null` in Redux. Then ChatPage would show guest mode. Low risk — backend always returns user in login response.

**Hidden risks:**
- `getMe()` returns additional fields (`isEmailVerified`, `authProvider`) that login response doesn't. Check if any component uses these. Grep for `isEmailVerified` and `authProvider` in frontend → only Topbar shows name/email. No component depends on these extra fields.

**Test plan:**
1. Login → verify user name appears in Topbar avatar
2. Check Network tab → only 1 POST request (login), no GET /me request

**Effort:** 5 minutes.

---

### Fix 5.5 — Add refresh token rotation

**Severity:** High
**What:** `refreshToken()` endpoint issues a new access token but keeps the same refresh token. If a refresh token is stolen, the attacker has persistent access for the full 7-day TTL.

**Where:** [backend/src/controllers/auth.controller.js:288-315](backend/src/controllers/auth.controller.js)

**How:**
After generating the new access token, also generate a new refresh token:
```js
// After line 307 (const accessToken = generateAccessToken(userId)):
const newRefreshToken = generateRefreshToken(userId);

// Replace old token in Redis
await redis.set(`refresh_token:${userId}`, newRefreshToken, 'EX', REFRESH_TOKEN_REDIS_TTL);

// Set new cookie
res.cookie('refreshToken', newRefreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
});

return sendResponse(res, 200, {
  message: 'Token refreshed.',
  data: { accessToken },
});
```

**Edge cases:**
- **Concurrent requests:** Two tabs make simultaneous requests, both trigger refresh. First one succeeds, rotates token. Second one has the old token → fails Redis whitelist check → user logged out in second tab. This is a known limitation of single-device token rotation. **Mitigation:** The axios interceptor's `isRefreshing` flag + queue prevents concurrent refreshes from the SAME tab. Cross-tab concurrency is rare and acceptable.
- **Network failure after rotation:** New token is in Redis but cookie wasn't set (network died). User's browser still has old cookie → next refresh fails → user logged out. This is actually MORE secure — it detects stolen tokens faster.

**Hidden risks:**
- After rotation, the `axiosInstance.js` interceptor's plain `axios.post('/auth/refresh')` call receives the new cookie automatically (browser sets it from the response). No frontend changes needed.

**Test plan:**
1. Login → let access token expire (15 min or modify TTL for testing)
2. Send a request → silent refresh fires → verify new access token works
3. Check Redis → refresh token should be DIFFERENT from the original one
4. Check browser cookies → refreshToken cookie should have new value

**Rollback:** Remove the 3 new lines (generate, redis.set, res.cookie for new refresh token).

**Completion criteria:**
- Refresh token changes on every `/auth/refresh` call
- Redis stores the new token
- Browser cookie updated with new token
- Concurrent single-tab requests still work (queue mechanism)

**Effort:** 15 minutes.

---

### Phase 5 Exit Criteria
- [ ] Password validation identical on frontend (Register + Reset) and backend
- [ ] AuthCallback handles all 4 error codes from backend
- [ ] Login doesn't make unnecessary getMe() call
- [ ] Refresh token rotates on every refresh

---

## 10. Phase 6 — Low Priority (If Time Allows)

These fixes are nice-to-have before deployment but not blocking. Fix them if time allows after Phases 1-5.

### Fix 6.1 — fetchSessions: don't silently swallow non-auth errors

**Where:** [frontend/src/api/tutorApi.js:42-44](frontend/src/api/tutorApi.js)

**How:**
```js
export const fetchSessions = async () => {
  try {
    const { data } = await axiosInstance.get('/api/v1/sessions');
    return data.data;
  } catch (err) {
    if (err.response?.status === 401) return { sessions: [] };
    console.error('[fetchSessions] Error:', err.message);
    return { sessions: [] };
  }
};
```

At minimum, log the error so it's visible during debugging. The silent catch hides real problems.

---

### Fix 6.2 — fetchSessionHistory: same treatment

**Where:** [frontend/src/api/tutorApi.js:53-55](frontend/src/api/tutorApi.js)

Same pattern as 6.1 — add `console.error` before returning null.

---

### Fix 6.3 — Clear sessionId on login

**Where:** [frontend/src/pages/LoginPage.jsx](frontend/src/pages/LoginPage.jsx)

Add `clearSessionId()` before navigating to ChatPage after login. Prevents loading a stale session from a different user/guest.

---

### Fix 6.4 — AppInitializer: skip retry on 403

**Where:** [frontend/src/components/AppInitializer.jsx](frontend/src/components/AppInitializer.jsx)

Check error status before retrying:
```js
} catch (err) {
  if (err.response?.status === 403) {
    if (isMounted) dispatch(clearCredentials());
    return;
  }
  // ... existing retry logic
}
```

---

### Fix 6.5 — Clear guest ID on logout

**Where:** [frontend/src/components/Topbar.jsx:54](frontend/src/components/Topbar.jsx)

Add `localStorage.removeItem('zuno-guest-id')` in the logout handler.

---

### Fix 6.6 — Theme toggle on auth pages (cosmetic)

**Where:** LoginPage.jsx, RegisterPage.jsx

Both receive `theme` and `toggleTheme` props from App.jsx but don't render a toggle. Add a small theme toggle icon in the top-right corner of auth-card, or accept current behavior (system theme applies).

---

### Phase 6 Exit Criteria
- [ ] Error logging added to silent-fail API calls
- [ ] sessionId cleared on login
- [ ] AppInitializer doesn't retry on 403
- [ ] Guest ID cleared on logout

---

## 11. Decisions Log

| Date | Decision | Reasoning | Outcome |
|------|----------|-----------|---------|
| 2026-06-20 | Google OAuth token-in-URL: document as tech debt, don't fix for MVP | Authorization code exchange requires new endpoint + AuthCallback rewrite. Access token TTL is 15min (short exposure). Small user base at launch. | Fix 1.3 — comment added, not refactored |
| 2026-06-20 | Token refresh failure: don't hard-redirect, let React handle | Full page reload destroys state. Better UX: user stays on page, sees error, can re-login via Topbar. | Fix 3.2 — dispatch clearCredentials instead |
| 2026-06-20 | Guest rate limit bypass: defer to post-deployment | Requires IP-based limiting which adds infra complexity. Guest limit is 5/day — not a critical abuse vector for a study app. | Moved to Phase 6 (low priority) |
| 2026-06-20 | Refresh token rotation: implement before deployment | Stolen refresh token without rotation = 7 days of persistent access. With rotation, stolen token becomes invalid on next legitimate use. | Fix 5.5 — implement in Phase 5 |

---

## 12. Session Protocol

### At Session Start
1. Read sections 0-2 (context, flow map)
2. Read section 3 (Status Tracker) → find next `[ ]`
3. Read that fix's detail in sections 5-10
4. Read section 11 (Decisions Log) for any updates

### During The Session
1. Implement the fix
2. Test according to the test plan in the fix description
3. Mark `[x]` in Status Tracker
4. Log any decisions in section 11

### At Session End
1. Confirm Status Tracker is updated
2. Note which fix is next

### Rules
- One fix at a time
- Test before marking done
- Don't skip phases — order is by priority
- If a fix is harder than expected, ask before simplifying
- Update this file as part of completing each fix

---

## 13. Verification Pass — 2026-07-25 (Precautionary Pre-Deployment Audit)

> **Trigger:** Farhan: *"mujhe aisa lg rha hai ki auth part me bhi problem hai"* — a precautionary full audit, not a response to a specific observed bug. Explicit instruction: read every existing auth-related file first, verify this plan's own tracker against real code (don't trust checkboxes blindly), and fold any new findings into THIS file rather than starting a new one.
>
> **Why this pass exists:** This plan's Status Tracker (Section 3) shows 34/35 items as `[x]` done. Spot-checking a sample against the live code found the tracker is **not fully reliable** — some fixes are exactly as documented, at least one is unfixed despite its checkbox, and one is fixed *better* than documented. This section records what was actually verified, not what was claimed.
>
> **Cross-referenced sources** (per Farhan's instruction to include every prior auth file): this document (`AUTH_SECURITY_PLAN.md`), `AUTH_PLAN.md` (architecture reference), and `PRE_LAUNCH_BLOCKERS.md` (a separate, later — 2026-06-23 — audit pass covering 4 additional auth-relevant findings: C-1, C-2, H-2, S-1, plus adjacent infra items H-1/H-3/P2.2/L-3 that touch the auth request path).

### 13.1 — Confirmed correctly fixed (verified against live code, not just the tracker)

These were spot-checked directly against current source and match their documented fix exactly. Listed so a future session doesn't re-audit them from scratch.

| Finding | File:Line checked | What was verified |
|---|---|---|
| Fix 1.1 (console.log leak) | `LoginPage.jsx` | No `console.log` anywhere in the file. |
| Fix 5.5 (refresh token rotation) | `auth.controller.js:316-326` | `refreshToken()` generates and stores a NEW refresh token on every call, matches plan exactly. |
| Fix 5.1 / 5.2 (password validation) | `auth.controller.js:40-48, 388-396` | Both `register()` and `resetPassword()` enforce 8+ chars, 1 number, 1 uppercase — identical rules, backend-enforced regardless of frontend. |
| Fix 3.2 (SPA-safe redirect on refresh failure) | `axiosInstance.js:108-115` | Uses `sessionStorage.setItem('zuno.authRedirect', ...)` + `clearCredentials()` dispatch — no `window.location.href` hard redirect. |
| Fix 3.3 (GuestOnlyRoute) | `App.jsx:55-56` | `/login` and `/register` both wrapped in `<GuestOnlyRoute>`. |
| Fix 4.1 (branded loading screen) | `App.jsx:24-37` | Matches the plan's proposed code exactly. |
| C-1 (OAuth token in URL) | `auth.controller.js:547-552`, `exchangeOAuthCode()` (:565-592) | **Fixed with the real solution**, not just documented as tech debt — see 13.3 below, this supersedes the older Fix 1.3 entry. |
| C-2 (cookie `sameSite: strict` cross-domain) | `auth.controller.js:185-190, 279-284, 321-326, 540-545` | All 4 cookie-set locations use `sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'` — matches the proposed fix exactly. |
| H-1 (rate limiters in-memory) | `rateLimiters.js:16-20` | All 3 limiters use `RedisStore` with distinct key prefixes (`rl_global:`, `rl_ask:`, `rl_auth:`). |
| H-2 (askTutor raw fetch, no auto-refresh) | `tutorApi.js:126-152` | `fetchWithTokenRefresh()` wraps the SSE fetch call with a silent-refresh-and-retry, mirrors the axios interceptor pattern. |
| H-3 (Helmet.js missing) | `app.js:22` | `app.use(helmet({ contentSecurityPolicy: false }))` present. |
| L-3 (morgan format) | `app.js:47` | `morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev')`. |
| P2.2 (sessionId UUID validation) | `step1.validateInput.js:12, 34` | UUID v4 regex check present, rejects malformed sessionId with 400. |
| S-3 (guest UUID validation + dev skip) | `guestRateLimit.js:5, 12, 18` | UUID regex enforced, `NODE_ENV === 'development'` skip present. |
| CORS scoping | `app.js:26-44` | Explicit origin allowlist function, not a wide-open `cors()` — the "no origin restriction" note in `ANALYSIS.md` is stale (predates this). |

### 13.2 — NOT actually fixed despite `[x]` in the tracker (real, open findings)

#### NEW-1 🔴 CRITICAL — Session ownership check still has the exact hole this plan's own Fix 1.2 analysis warned about

**Evidence:** [step2.loadSession.js:32-37](backend/src/ask/step2.loadSession.js#L32):
```js
const sessionOwner = dbSession.userId?.toString();
if (sessionOwner && userId && sessionOwner !== userId) {
  throw new ApiError(403, 'Yeh session aapka nahi hai.');
}
```
This is the **original, uncorrected** check from Fix 1.2's first draft — not the "corrected check" the same fix section explicitly derived (`if (sessionOwner && sessionOwner !== userId)`, i.e. without the `&& userId` guard). The code has an inline comment defending this as intentional (*"If userId is null (guest / token expired), sessionId itself is the ownership proof"*), but that directly contradicts this plan's own risk analysis for this exact line, and the hole it described was never closed.

**Concrete attack scenario:** `ask.routes.js` uses `optionalAuth` (not `requireAuth`) — an unauthenticated request is allowed through with `req.user = null` → `userId = null`. If an attacker (or the next person on a shared/cyber-café computer, per C-1's own threat model) obtains a logged-in student's `sessionId` — e.g. it's still sitting in `localStorage` on a shared computer after the student walks away without explicitly logging out — they can send `/api/v1/ask` with that `sessionId` and **no auth token at all**. `sessionOwner` is truthy (the session has a real owner), but `userId` is `null` → `sessionOwner && userId && ...` short-circuits to `false` → **the check never fires** → the unauthenticated request reads and continues writing into that student's real chat history.

This is arguably *easier* to exploit than the case the plan's test plan actually covers ("Login as User B → send User A's sessionId → expect 403") — that scenario **is** correctly blocked (both sides authenticated, mismatch caught). The gap is specifically the **unauthenticated-attacker-with-a-known-sessionId** case, which the plan identified in its own prose but never implemented the fix for.

**Why this matters more than a typical medium finding:** it's the same threat model (shared/cyber-café computers) that justified fixing C-1 as Critical, applied to a different credential (sessionId instead of JWT), and it's currently open.

**Fix:** exactly what this plan already specified — remove the `&& userId` guard:
```js
if (sessionOwner && sessionOwner !== userId) {
  throw new ApiError(403, 'Yeh session aapka nahi hai.');
}
```
This still leaves guest sessions (`sessionOwner` null) fully open to anyone, which is correct — the fix only closes the "session has a real owner, requester presents no credential" gap.

**✅ FIXED 2026-07-25** — `step2.loadSession.js:32-37` now uses the corrected check (`if (sessionOwner && sessionOwner !== userId)`), matching this plan's own analysis. Verified: guest-with-known-sessionId can no longer bypass ownership on an owned session; guest-owns-guest-session and owner-owns-own-session paths unaffected (traced all 5 owner/requester combinations, no regression).

---

#### NEW-2 🟠 HIGH — `ChatPage.jsx` still uses the pre-Fix-2.1 `window.history.replaceState` pattern — the ORIGINAL toast-on-refresh bug may still reproduce on the most-visited post-login page

**Evidence:** [ChatPage.jsx:123-134](frontend/src/pages/ChatPage.jsx#L123):
```js
useEffect(() => {
  if (location.state?.toastSuccess) {
    showToast(location.state.toastSuccess, 'success');
  } else if (location.state?.toastError) {
    showToast(location.state.toastError, 'error');
  }
  
  if (location.state) {
    // Clear React Router state from browser history to prevent toast on F5 refresh
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}, []);
```
The toast-detection logic (success + error) matches what Fix 2.1's "AFTER" sample described — but the actual state-clearing line was never migrated to `navigate(location.pathname, { replace: true, state: null })`. `navigate` is already imported and in scope two lines above (`const navigate = useNavigate();`, line 117) — the fix was simply never applied here, even though `LoginPage.jsx` (verified in 13.1) got the correct version.

**Why this is worse than a typical missed toast fix:** ChatPage is the landing page for almost every successful auth flow in the redirect map (Section 2, rows 1, 3, 4, 5, 6) — email login, logout, Google OAuth success/error. This is the exact bug that was the **user's original, named complaint** that triggered this entire plan (*"toast hr refresh krne pe bhi message dikh rha hai"*) — per this plan's own root-cause explanation (Fix 2.1), raw `replaceState` wipes React Router's internal `key`/`idx` tracking, which can let a stale toast reappear on refresh depending on browser history behavior.

**Fix:** apply Fix 2.1's already-specified pattern here (it was written for this exact file/location, just never applied):
```js
if (location.state) {
  navigate(location.pathname, { replace: true, state: null });
}
```

**✅ FIXED 2026-07-25** — `ChatPage.jsx:130-133` now uses `navigate(location.pathname, { replace: true, state: null })`, matching the proven `LoginPage.jsx` pattern. Verified: no `useEffect` in `ChatPage.jsx` depends on `location`, so the extra re-render this causes has no cascading side-effects. Live UI verification via register/login flow was not possible in this environment (registration requires real-email verification), so this was confirmed via static analysis + console-error check only.

### 13.3 — Findings that were fixed BETTER than documented (tracker understates progress)

#### Fix 1.3 (OAuth token-in-URL) — superseded by a real fix, not just documented as tech debt

The original Fix 1.3 (2026-06-20) explicitly deferred the proper fix ("documenting for now... not fixing now"). By 2026-06-23, `PRE_LAUNCH_BLOCKERS.md`'s C-1 shows the *actual* code-exchange flow was built: `googleCallback()` now generates a one-time `oauth_code` (32 bytes hex, 30s Redis TTL), redirects with `?code=` instead of `?token=`, and a new `POST /api/v1/auth/exchange` endpoint (`exchangeOAuthCode`, [auth.controller.js:565-592](backend/src/controllers/auth.controller.js#L565)) trades the code for the real access token via a JSON POST body — never in a URL. Verified this endpoint is real, has format validation (`/^[0-9a-f]{64}$/`) and is single-use (`redis.del` immediately after a successful `get`).

**Action:** update Fix 1.3's status — it's fully fixed, not deferred. The "Document Google OAuth token-in-URL as known tech debt" framing in Section 5 is stale.

### 13.4 — New findings, not present in any prior auth document

#### NEW-3 🟡 MEDIUM — `env.js` does not validate auth-critical secrets at startup

**Evidence:** [env.js:67-129](backend/src/config/env.js#L67) — `validateEnv()` checks `MONGODB_URI`, the embedding provider key, `LLM_PROVIDER`, `EMAIL_HOST/USER/PASS`, and `FRONTEND_URL`. It does **not** check `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or that Redis is reachable.

**What could happen:** if `JWT_ACCESS_SECRET` is missing or empty in a deployment's `.env` (a realistic mistake when copying `.env.example` to a new hosting provider), the server starts up successfully, passes health checks, and looks fine — until the first `login()` or `register()` call, where `jwt.sign(payload, undefined, ...)` throws. The failure is discovered by the first real user, not at deploy time.

**Why medium, not critical:** this fails loudly (a thrown error, caught by the route's try/catch, surfaces as a 500) rather than silently issuing insecure tokens — so it's a slow-discovery operational gap, not a silent security hole.

**Fix:** add to `validateEnv()`'s checklist: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (same `isRealKey()` helper already used for provider keys).

#### NEW-4 🟡 MEDIUM (product correctness, not security) — No guest-to-user data migration on login/register

**Evidence:** [chapterProgress.service.js:34-55](backend/src/services/chapterProgress.service.js#L34) — every lookup/write is keyed by `userId ? {userId, chapterId} : {guestId, chapterId}` — completely separate namespaces, confirmed no merge/link code exists anywhere (grepped for `convert`, `migrate.*guest`, `mergeGuest`, `claimGuest` — no matches in auth or ask code). `ChatSession` behaves the same way (`userId` field, separate from any guest key).

**What could happen:** a student uses Zuno as a guest, makes real progress (chapter completion, chat history), then registers or logs in — which the app actively encourages (`GuestLoginPrompt.jsx`, `GuestLimitModal.jsx`). After login, their guest-scoped `ChapterProgress`/`ChatSession` rows still exist in MongoDB (nothing is deleted), but are permanently unreachable from the UI, because the UI now queries by `userId`, not the old `guestId`. From the student's point of view, all their progress silently vanished the moment they did the thing the app told them to do.

**Why this belongs in an auth audit even though it's not a security bug:** it's a direct, predictable consequence of how the auth system stores identity, and it will be the most common "why is Zuno broken" support complaint post-launch — every guest who converts loses everything.

**✅ FIXED 2026-07-25 (partial, by design)** — Implemented a "claim" flow rather than a full merge:

- New `claimGuestData(userId, guestId)` in [chapterProgress.service.js](backend/src/services/chapterProgress.service.js) — for each guest `ChapterProgress` doc: if the user has no doc for that chapter, reassign it (`guestId → null`, `userId` set); if both exist, the more-advanced one (by `completedTopicIds` count) wins, engagement counters (`totalTimeSpentSec`, `totalMessagesExchanged`, `totalDoubtsAsked`, `totalExplainMoreCount`) are summed onto the survivor, and the loser is deleted — so the `user_chapter_unique` index is never violated. `study_events` are reassigned via a plain `updateMany` (no uniqueness constraint there, no conflict possible).
- New endpoint `POST /api/v1/auth/claim-guest-progress` ([auth.controller.js](backend/src/controllers/auth.controller.js), `requireAuth`-gated) — validates `guestId` as a UUID (same regex as `guestRateLimit.js`), calls `claimGuestData(req.user.id, guestId)`. An invalid/missing `guestId` is a silent no-op, never an error — this can't block login.
- Frontend: [LoginPage.jsx](frontend/src/pages/LoginPage.jsx) and [AuthCallback.jsx](frontend/src/pages/AuthCallback.jsx) (Google OAuth) now read `zuno-guest-id` from `localStorage` right after receiving the access token, call `claimGuestProgress()` (new function in [authService.js](frontend/src/services/axios/authService.js)), then clear the key. `claimGuestProgress()` swallows its own errors — a network failure during claim degrades to "guest progress not carried over," never a broken login.

**Deliberately NOT in scope:** `ChatSession`/`ChatHistory` (chat sessions and messages) are NOT transferred — those models have no `guestId` field at all (unlike `ChapterProgress`/`StudyEvent`), so migrating them would require a schema change plus backfill, a materially bigger and riskier change. This was a conscious scope cut: chapter progress (what a student has actually learned) is the highest-value data to preserve; chat history loss is an acceptable "fresh start" trade-off for now. Flagged here as a deliberate limitation, not an oversight — a future iteration could add `guestId` to those two models and extend `claimGuestData` the same way, without touching anything built here.

**Verified** via an isolated script against the real MongoDB connection (synthetic guest/user docs, not real user data): (1) no-conflict chapter transfers cleanly, (2) guest-ahead-of-user conflict — guest's progress wins and is copied onto the surviving doc, (3) user-ahead-of-guest conflict — user's own progress is correctly preserved (not overwritten by the less-advanced guest doc), (4) engagement counters sum correctly in both conflict cases, (5) study events reassign correctly, (6) exactly one document survives per chapter in every case — no duplicate-key errors from `user_chapter_unique`/`guest_chapter_unique`. All 10 assertions passed. Live UI verification (real register → login → claim) was not possible in this environment (registration requires real-email verification), so the HTTP layer (route wiring, `requireAuth`, request/response shape) was verified by static review + syntax checks only, not an end-to-end browser test.

### 13.5 — Not re-verified in this pass (scope note, not a finding)

The ~25 remaining Phase 2/4/6 toast, accessibility, and cosmetic findings (Fix 2.2, 2.4, 2.5, 4.2–4.8, 6.1–6.5) and the Session System Bugs in `PRE_LAUNCH_BLOCKERS.md` (S-2, S-4) and its P2.1/P2.4/L-1/L-2 items were **not individually re-verified against live code** in this pass — the sample checked in 13.1 (LoginPage's toast handling) was correct, but NEW-2 shows the sample is not 100% representative. These should get a full re-verification pass before being trusted, using the same method as this section (read the actual file, don't trust the checkbox) — flagged here rather than silently assumed fixed.

### 13.6 — Priority ranking for what's actually open

| # | Finding | Severity | Why this rank |
|---|---|---|---|
| 1 | ~~NEW-1 — session ownership check incomplete~~ | 🔴 Critical | **✅ Fixed 2026-07-25** — same severity class as the already-fixed C-1/C-2; unauthenticated session hijack via leaked/shared sessionId; narrow one-line fix already specified by this plan itself |
| 2 | ~~NEW-2 — ChatPage toast replaceState~~ | 🟠 High | **✅ Fixed 2026-07-25** — reproduces the exact bug that motivated this entire plan, on the highest-traffic post-auth page; one-line fix, pattern already proven correct on LoginPage |
| 3 | ~~NEW-4 — guest-to-user data orphaning~~ | 🟡 Medium | **✅ Fixed 2026-07-25 (partial by design)** — ChapterProgress + StudyEvents now claimed on login/OAuth; ChatSession/ChatHistory deliberately out of scope (no `guestId` field on those models — would need a schema change) |
| 4 | NEW-3 — env.js missing secret validation | 🟡 Medium | Real gap but fails loudly and fast in practice; lowest urgency of the four. **Still open.** |
| 5 | Section 13.5 scope gap | — | Not a finding — a to-do to re-verify ~25 lower-severity items before fully trusting this plan's tracker again |

---

## End Of Plan

**Original scope:** 35 findings across 6 phases (2026-06-20).
**2026-07-25 verification pass:** cross-referenced against `PRE_LAUNCH_BLOCKERS.md` and live code. Result: most fixes hold up; 2 findings (NEW-1, NEW-2) are open despite being marked done; 1 finding (Fix 1.3) is fixed better than documented; 2 new findings (NEW-3, NEW-4) discovered; ~25 low-severity items not re-verified (see 13.5).
**Target outcome:** Zero critical security issues, zero toast bugs, clean navigation flows, polished auth UX.

**This file is the single source of truth. Trust it, but verify it against live code before relying on a checkbox — this pass is proof the tracker alone is not enough.**
