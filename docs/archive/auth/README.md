# Archived — Auth Stabilization Planning Files

Auth's stabilization effort (build → precautionary re-audit → fix → verify, started
2026-07-25 on the `auth-stabilization` branch) is **DONE**. Every fix claimed by the
tracker has now been individually verified against live code — not just checked off —
and every finding found open has been fixed and re-verified. This folder is the
permanent historical record — kept for reference, not the current source of truth for
active work.

**Start with [`AUTH_SECURITY_PLAN.md`](AUTH_SECURITY_PLAN.md)** — the definitive,
up-to-date audit. Its Section 13 ("Precautionary re-audit, 2026-07-25/26") is the most
current status: it re-verified every fix this plan claims, corrected two stale/wrong
claims from earlier passes, found 4 real open findings, fixed all 4, then did a full
second pass over every remaining lower-severity item and found them all correct.
[`AUTH_PLAN.md`](AUTH_PLAN.md) is the original architecture blueprint (JWT/Redis/bcrypt/
Google OAuth design decisions) — read it for *why* the system is shaped the way it is;
its own status tracker is stale (written before the frontend auth pages existed) and
should **not** be trusted for current status — defer to `AUTH_SECURITY_PLAN.md` instead.

## Status summary (as of 2026-07-26)

**4 real findings, all fixed and verified:**
- 🔴 **NEW-1 (Critical) — Session ownership check incomplete.** An unauthenticated
  request with a known/leaked `sessionId` could bypass ownership checks entirely,
  because the check only fired when *both* sides were authenticated. Fixed in
  `step2.loadSession.js` by removing the extra `&& userId` guard — matches the
  corrected check this plan's own Fix 1.2 analysis had already derived but never
  applied.
- 🟠 **NEW-2 (High) — ChatPage toast reappearing on refresh.** This was the user's
  original complaint that triggered the whole audit. `ChatPage.jsx` still used raw
  `window.history.replaceState`, which clears the browser history entry but not React
  Router's own internal state — so a stale toast could resurface. Fixed by switching to
  `navigate(path, { replace: true, state: null })`, the same pattern already proven
  correct on `LoginPage.jsx`.
- 🟡 **NEW-4 (Medium, product correctness) — Guest progress lost on login/register.**
  A student who studied as a guest and then signed up lost all chapter progress —
  `ChapterProgress`/`ChatSession` were keyed by `userId` XOR `guestId`, with zero
  merge logic. Fixed with a "claim" flow: `claimGuestData()` transfers
  `ChapterProgress` + `StudyEvent` docs to the new `userId` on login/OAuth success,
  resolving same-chapter conflicts by keeping whichever side is further along.
  **Deliberately not in scope:** `ChatSession`/`ChatHistory` (chat messages) —
  those models have no `guestId` field at all, so migrating them would need a schema
  change; chat history loss was accepted as a "fresh start" trade-off, chapter
  progress (what the student actually learned) was the priority.
- 🟡 **NEW-3 (Medium) — env.js didn't validate JWT/Google secrets at startup.** A
  missing `GOOGLE_CLIENT_ID`/`SECRET` failed *completely silently* (no thrown error —
  `google-auth-library` just builds a broken OAuth URL with an empty `client_id`,
  confirmed by direct testing). Missing JWT secrets failed loudly (`jwt.sign` throws,
  caught by existing try/catch, surfaces as a 500) — lower urgency. Fixed by adding
  presence checks to `validateEnv()`, using the same pattern as the existing
  `EMAIL_HOST`/`USER`/`PASS` checks (not `isRealKey()`, whose length-based threshold
  would have rejected the current legitimate short `JWT_REFRESH_SECRET`).

**2 stale claims from the original write-up, corrected (not fixed — nothing was
actually wrong):**
- Redis reachability was claimed as unchecked at startup — **false**. `connectRedis()`
  in `server.js` already pings Redis at startup and exits fatally in production.
- The originally-proposed fix for NEW-3 (reuse `isRealKey()` for JWT secrets) was
  tested against the real `.env` before implementing and found it would have broken
  the working dev server (current `JWT_REFRESH_SECRET` is 9 characters, below
  `isRealKey()`'s `>10` threshold). Caught before it shipped.

**~25 lower-severity items (Phase 2/4/6 toast, accessibility, cosmetic fixes; plus
`PRE_LAUNCH_BLOCKERS.md`'s P2.1/P2.4/L-1/L-2/S-2/S-4) — individually re-verified
against live code, all found correct.** Nothing new was fixed here; this pass existed
to confirm the tracker could be trusted after NEW-1/NEW-2 showed it wasn't 100%
reliable on its own.

**Also cleaned up as part of this stabilization:** three stray duplicate files
(`authService - Copy.js`, `axiosInstance - Copy.js`, `authSlice - Copy.js`) — accidental
file copies, byte-identical to their originals, imported nowhere — deleted.

**Nothing was left open.** Every fix this plan claims has been checked against the
actual file at least once; every real gap found was fixed and re-verified.

## Files

- `AUTH_SECURITY_PLAN.md` — the definitive, current audit. Read this first.
- `AUTH_PLAN.md` — original architecture blueprint. Read for design rationale; its
  status tracker is outdated, defer to `AUTH_SECURITY_PLAN.md` for current state.

## Related, not archived

- `PRE_LAUNCH_BLOCKERS.md` (repo root) — a broader pre-launch audit that includes some
  auth-adjacent items (C-1, C-2, H-1/H-2/H-3, S-1–S-4) alongside non-auth items
  (streaming, rate limiting, caching, deployment). Stays at the root because **P0.5
  (Docker/CI-CD deployment) is still in progress** — archiving this file would hide
  active work.
- `SESSION_DESIGN.md` (repo root) — the core session-architecture reference (`LOCKED`
  status), not an auth planning doc. Still the live source of truth for
  `ChatSession` schema decisions.
- `backend/src/auth/` — live production code (`authMiddleware.js`, `tokenHelpers.js`,
  `emailHelpers.js`). Not a planning doc, not archived.
