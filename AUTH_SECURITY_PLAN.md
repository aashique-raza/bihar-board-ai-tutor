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
- [x] Fix 1.2 — Add session ownership check in Ask pipeline (`step2.loadSession.js`)
- [x] Fix 1.3 — Document Google OAuth token-in-URL as known tech debt

### Phase 2 — Toast Bugs (User's primary complaint)
- [x] Fix 2.1 — Replace `window.history.replaceState` with `navigate(path, { replace: true, state: null })` in ALL pages
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
- [ ] Fix 4.1 — Branded loading screen (replace plain "Loading..." text)
- [ ] Fix 4.2 — ForgotPassword: add `|| !!emailError` to `isDisabled` check
- [ ] Fix 4.3 — Add "session expired" message when redirected to login from axios interceptor
- [ ] Fix 4.4 — Reset password success: pass toast to /login via navigate state
- [ ] Fix 4.5 — AuthCallback: use auth-page styling instead of inline styles
- [ ] Fix 4.6 — Add `autocomplete` attributes to all auth form fields
- [ ] Fix 4.7 — Disable Google OAuth button during form submission (loading state)
- [ ] Fix 4.8 — Fix `<a role="button">` keyboard accessibility (add tabIndex + onKeyDown)

### Phase 5 — Backend Hardening
- [ ] Fix 5.1 — Unify password validation (backend: add number + uppercase requirement)
- [ ] Fix 5.2 — ResetPasswordPage: match RegisterPage's password validation rules
- [ ] Fix 5.3 — Add missing AuthCallback error codes (`google_cancelled`, `account_disabled`)
- [ ] Fix 5.4 — LoginPage: use user data from login response instead of extra `getMe()` call
- [ ] Fix 5.5 — Add refresh token rotation in `refreshToken()` endpoint

### Phase 6 — Low Priority (Fix if time allows before deployment)
- [ ] Fix 6.1 — `fetchSessions`: distinguish auth errors from real failures (stop silent swallow)
- [ ] Fix 6.2 — `fetchSessionHistory`: same as 6.1
- [ ] Fix 6.3 — Clear old `sessionId` from localStorage on login (cross-user edge case)
- [ ] Fix 6.4 — AppInitializer: don't retry on 403 (disabled account)
- [ ] Fix 6.5 — Logout: also clear `zuno-guest-id` from localStorage
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

## End Of Plan

**Total scope:** 35 findings across 6 phases.
**Estimated total effort:** 5-6 hours across 2-3 sessions.
**Target outcome:** Zero critical security issues, zero toast bugs, clean navigation flows, polished auth UX.

**This file is the single source of truth. Trust it. Update it.**
