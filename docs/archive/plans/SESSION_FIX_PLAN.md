# SESSION_FIX_PLAN.md
# Zuno Session — Complete Fix & Feature Implementation Plan
# Created: 2026-06-15
# Status: PHASE 1 COMPLETE — Phase 2 next

# HOW TO USE THIS FILE
# --------------------
# Work through phases IN ORDER. Do not skip.
# Each task has: What, Why, Exact files, Edge cases, Test criteria, Status.
# Update status: TODO → IN_PROGRESS → DONE after each task.
# SESSION_DESIGN.md is the architecture decision doc — do NOT change it.
# This file is the implementation tracker — all details live here.

---

## REFERENCE: SESSION_DESIGN.md Key Decisions (DO NOT CONTRADICT)
# Read SESSION_DESIGN.md before changing anything. These are locked:
# - Bounded multi-session (like GPT/Claude sidebar)
# - 15,000 token limit per session (env: SESSION_TOKEN_LIMIT)
# - Session history sidebar for logged-in users
# - Guest users: no sidebar, show "login to save history" prompt
# - Session title: auto-generated on FIRST query, stored in DB
# - sessionType: 'focus' (one chapter) | 'global' (free exploration)
# - Message storage: SEPARATE chatHistory collection (Option B — already built)
# - Focus Mode: one session permanently bound to one chapter

---

## CURRENT STATE AUDIT (what is already built)

### Backend — Already exists:
- [x] ChatSession model (chatSession.model.js) — has: sessionId, userId, mode, title, lastMessageAt, chatState
- [x] ChatHistory model (chatHistory.model.js) — has: sessionId, userId, messages[] (max 30 kept)
- [x] chatHistory.service.js — getChatHistory(), getRecentChatHistory(), addChatMessages()
- [x] chatSession.service.js — findChatSession(), updateChatSessionState(), createChatSession()
- [x] Auth middleware (optionalAuth, requireAuth) — req.user set correctly for logged-in users
- [x] Messages ARE saved to MongoDB on every turn (step7.saveAndRespond.js)

### Frontend — Already exists:
- [x] session.js — getSavedSessionId() and saveSessionId() (localStorage only)
- [x] ChatPage.jsx — loads sessionId from localStorage on init, saves new sessionId from backend response
- [x] Messages displayed in React state only (in-memory — lost on refresh)

### What is MISSING (causes all 3 problems):
- [ ] No session expiry → same sessionId reused forever → old context bleeds into new day
- [ ] No "New Chat" button → user cannot start fresh manually
- [ ] Frontend never fetches chat history from DB → messages lost on refresh
- [ ] No backend GET endpoint for chat history (getChatHistory() exists in service but no route)
- [ ] No sessions list API for sidebar
- [ ] ChatSession schema missing: totalTokensUsed, isLocked, sessionType fields
- [ ] No token counting in pipeline
- [ ] No sidebar component
- [ ] Session title always 'New Chat' — no auto-generation
- [ ] userId never saved to DB (FIX-005 from BRAIN_FIX_HANDOFF.md — needed for sidebar)

---

## PHASE 1 — Immediate Broken Behavior Fix
# Goal: Stop the bleeding. Fix the 3 problems breaking the app today.
# Problems: (A) chat disappears on refresh, (B) old session bleeds into new day, (C) no fresh start
# Estimated: 1-2 days
# Dependency: None — can start immediately

---

### P1-T1 — Session auto-expiry in localStorage
**Status: DONE (revised design)**
**Problem it fixes:** "hii" → "kal milte hain" — old session context bleeding into new day
**File:** `frontend/src/utils/session.js`

**Current code (broken):**
```js
// Never expires. Same sessionId returned forever.
export const getSavedSessionId = () => {
  return window.localStorage.getItem(SESSION_STORAGE_KEY) || '';
};
```

**Revised logic (changed from plan after design discussion):**
- Simple pointer — only stores the sessionId string, no timestamp, no time-based expiry
- Sessions persist until token limit (15k) — not time-based
- `clearSessionId()` called on logout and New Chat click
- Reason: multiple long-lived sessions in sidebar, each session valid until token limit regardless of time

**Exact change:**
```js
const SESSION_STORAGE_KEY = 'zuno.sessionId';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

export const getSavedSessionId = () => {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return '';
    const { id, savedAt } = JSON.parse(raw);
    if (!id || !savedAt) return '';
    if (Date.now() - savedAt > SESSION_MAX_AGE_MS) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return '';
    }
    return id;
  } catch {
    return '';
  }
};

export const saveSessionId = (sessionId) => {
  if (!sessionId) return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    id: sessionId,
    savedAt: Date.now(),
  }));
};

export const clearSessionId = () => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
};
```

**Edge cases:**
- Old format (plain string, not JSON) → JSON.parse throws → catch returns '' → fresh session ✅
- Tab closed and reopened within 8h → same session ✅ (expected)
- Tab closed and reopened after 8h → fresh session ✅
- Multiple tabs → all share same localStorage → same session (expected behavior) ✅

**Test:** Open app, note sessionId in localStorage. Wait (or manually set savedAt to 0). Refresh. New sessionId should be generated.

---

### P1-T2 — "New Chat" button
**Status: DONE**
**Problem it fixes:** User cannot manually start a fresh session
**Files:** `frontend/src/pages/ChatPage.jsx`, `frontend/src/components/Topbar.jsx`

**What it does:**
1. Clear localStorage sessionId (call `clearSessionId()`)
2. Generate fresh sessionId (crypto.randomUUID())
3. Reset messages state to [createWelcomeMessage()]
4. Reset studyMode to 'global'
5. Reset selectedChapterId to null
6. Set new sessionId in state + save to localStorage

**Where to put the button:** Topbar (top-right area, next to Focus button)
- Label: "New Chat"
- Style: outlined button, small — same family as Focus button
- On mobile: icon only (ChatBubbleOutline icon)

**ChatPage.jsx — add handler:**
```js
const handleNewChat = useCallback(() => {
  // Cancel any in-flight request first
  controllerRef.current?.abort();
  clearTimeout(timeoutRef.current);
  controllerRef.current = null;

  // Clear session
  clearSessionId();
  const freshId = crypto.randomUUID();
  setSessionId(freshId);
  saveSessionId(freshId);

  // Reset UI
  setMessages([createWelcomeMessage()]);
  setStudyMode(STUDY_MODES.global);
  setSelectedChapterId(null);
  setError('');
  setIsAsking(false);
}, []);
```

**Edge cases:**
- User clicks New Chat while a request is in-flight → abort first, then reset ✅ (handled above)
- New Chat during Focus mode → reset to global, clear selectedChapterId ✅
- After New Chat, next message creates a brand new session in DB ✅ (backend creates on first message)

**Test:** Have a conversation. Click New Chat. Chat clears, welcome message shows. Send a message → backend creates new session in DB, new sessionId saved.

---

### P1-T3 — Backend API: GET /api/v1/session/history
**Status: DONE (revised endpoint)**
**Problem it fixes:** Frontend can't load previous messages on page refresh
**Files (backend):**
- `backend/src/controllers/session.controller.js` (NEW FILE)
- `backend/src/routes/session.routes.js` (NEW FILE)
- `backend/src/app.js` (add route)

**Endpoint spec:**
```
GET /api/v1/session/history?sessionId=<uuid>&limit=<number>
Auth: optionalAuth (works for both guest and logged-in)
Response: { success: true, data: { sessionId, messages: [...], sessionMeta: {...} } }
```

**Actual implementation (changed from plan):**
- Endpoint: `GET /api/v1/sessions/:sessionId/history` (path param, not query)
- Auth: `requireAuth` (logged-in users only — guests don't get history restore in Phase 1)
- Ownership check added: `session.userId !== req.user.id` → 404 (prevents enumeration attacks)
- Files: `backend/src/controllers/session.controller.js` (NEW), `backend/src/routes/session.routes.js` (NEW), `backend/src/app.js`

**Controller logic:**
```js
export const getSessionHistory = async (req, res, next) => {
  try {
    const { sessionId, limit = 30 } = req.query;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    const messages = await getChatHistory(sessionId, Number(limit));
    const session = await findChatSession(sessionId);

    return res.json({
      success: true,
      data: {
        sessionId,
        messages,
        sessionMeta: session ? {
          title: session.title,
          mode: session.mode,
          lastMessageAt: session.lastMessageAt,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};
```

**Message format coming from DB:**
```js
{ role: 'student' | 'tutor', text, action, sources, metadata, createdAt }
```

**Edge cases:**
- sessionId not found in DB → messages: [], sessionMeta: null (fresh session — no error) ✅
- limit > 30 → cap at 30 (getChatHistory already handles this) ✅
- Invalid sessionId format → DB returns null/empty → same as not found ✅
- sessionId belongs to different userId → Phase 1: allow (Phase 2 add ownership check) ✅

**Test:** After sending messages, call GET /api/v1/session/history?sessionId=<id> → should return messages array.

---

### P1-T4 — Frontend: Load chat history on page init
**Status: DONE**
**Problem it fixes:** Messages disappear on refresh
**Files:** `frontend/src/api/tutorApi.js`, `frontend/src/pages/ChatPage.jsx`

**tutorApi.js — add function:**
```js
export const fetchSessionHistory = async (sessionId, signal) => {
  const res = await fetch(
    `${API_BASE}/api/v1/session/history?sessionId=${sessionId}&limit=30`,
    { signal }
  );
  if (!res.ok) throw new Error('Session history load failed');
  const json = await res.json();
  return json.data;
};
```

**ChatPage.jsx — load history on mount:**

When ChatPage loads:
1. Get savedSessionId from localStorage
2. If empty → show welcome message only (fresh session)
3. If exists → call fetchSessionHistory(sessionId)
4. If history has messages → convert them to UI message format + show
5. If history empty or API fails → show welcome message only (graceful fallback)

**Message conversion (DB format → UI format):**
```js
const dbMessageToUiMessage = (dbMsg) => ({
  id: crypto.randomUUID(),
  role: dbMsg.role === 'student' ? 'student' : 'zuno',
  answer: dbMsg.text,
  status: dbMsg.metadata?.status || 'answered',
  sources: dbMsg.sources || [],
  sections: dbMsg.metadata?.sections || [],
  responseMode: dbMsg.metadata?.responseMode || null,
});
```

**Loading state:**
- While history is loading → show skeleton/spinner in chat area (not welcome message yet)
- If load fails → show welcome message (silent fallback — do not show error to user)
- If load succeeds with 0 messages → show welcome message
- If load succeeds with messages → show messages (no welcome message — they're returning)

**Edge cases:**
- No sessionId in localStorage → skip fetch, show welcome message ✅
- API timeout / network error → catch silently, show welcome message ✅
- DB has messages but frontend conversion fails → catch, show welcome message ✅
- Page refreshed mid-request (previous question was loading) → only completed messages in DB ✅
  (The in-flight response was never saved → that's fine, student can ask again)
- 30 messages cap → oldest messages won't show, but that's acceptable for Phase 1 ✅

**Important: Do NOT add history loading to every route change** — only on ChatPage mount (initial load).

**Test:** Send 5 messages. Refresh page. All 5 messages should reload from DB. Welcome message should NOT appear.

---

## PHASE 1 COMPLETION CHECKLIST
- [x] P1-T1: localStorage simple pointer (no time expiry — sessions persist by token limit)
- [x] P1-T2: "New Chat" button clears session, resets UI
- [x] P1-T3: GET /api/v1/sessions/:sessionId/history returns correct messages (requireAuth + ownership)
- [x] P1-T4: Chat history restores on page refresh
- [x] FIX-005: userId saved to DB on every session (done alongside Phase 1)
- [x] Logout bug fixed: requireAuth removed from logout route, cookie cleared correctly
- [x] Auth race condition fix: history load waits for isAuthLoading = false
- [x] Guest safety guard: history API not called for guests (prevents 401 loop)
- [x] REGRESSION: Ask question works normally after Phase 1
- [x] REGRESSION: Auth flow (login/logout) works correctly
- [ ] REGRESSION: Focus mode — not explicitly tested after Phase 1

---

## PHASE 2 — Full Session Feature (as per SESSION_DESIGN.md)
# Goal: Build the complete bounded multi-session system with sidebar.
# Dependency: Phase 1 MUST be complete. FIX-005 (userId in DB) MUST be done first.
# Estimated: 3-4 days
# Read SESSION_DESIGN.md before starting any Phase 2 task.

---

### P2-T1 — FIX-005: Wire userId through pipeline to DB
**Status: DONE (completed during Phase 1)**
**Why it must come BEFORE sidebar:** Sidebar shows sessions per user (userId filter).
If userId is null in all documents, no session can be linked to a user.
**Full fix details in:** BRAIN_FIX_HANDOFF.md → FIX-005 section
**Files:** `backend/src/controllers/ask.controller.js`, `backend/src/ask/askOrchestrator.js`, `backend/src/ask/step7.saveAndRespond.js`

**Summary of change:**
```js
// ask.controller.js
const userId = req.user?.userId || null;
const answerPayload = await askQuestion(req.body, { userId });

// askOrchestrator.js
export const askQuestion = async (body = {}, { userId = null } = {}) => {
  // ... pass userId to step7
  return saveAndRespond(input, session, context, decision, retrieval, response, userId);
};

// step7.saveAndRespond.js — add userId parameter, pass to addChatMessages
await addChatMessages(sessionId, [...messages], userId);
```

**Also:** Update ChatSession on first save to include userId. Check chatSession.service.js → `getOrCreateChatSession` needs to accept userId and set it on $setOnInsert.

---

### P2-T2 — ChatSession schema: Add missing fields
**Status: TODO**
**File:** `backend/src/models/chatSession.model.js`

**Fields to add (from SESSION_DESIGN.md target schema):**
```js
// Add to chatSessionSchema:
sessionType: {
  type: String,
  enum: ['focus', 'global'],
  default: 'global',
},
totalTokensUsed: {
  type: Number,
  default: 0,
},
isLocked: {
  type: Boolean,
  default: false,
},
messageCount: {
  type: Number,
  default: 0,  // Needed for title generation trigger (first query check)
},
```

**Note on existing `mode` field:** Keep it. `mode` = auth mode (guest/logged_in). `sessionType` = study mode (focus/global). These are different.

**Migration concern:** Existing documents in MongoDB won't have these fields. MongoDB handles this gracefully — fields default to undefined/null for old docs, which is fine. No migration needed.

---

### P2-T3 — Session title auto-generation on first query
**Status: DONE**
**Files:** `backend/src/ask/step7.saveAndRespond.js`, `backend/src/prompts/tutorPrompt.js`
**Decision from SESSION_DESIGN.md:** "Generated inside Step 6/7 — NOT a separate API call. Zero extra cost."

**How:**
- step7 checks: if `session.messageCount === 0` (first query ever in this session)
- If yes → ask LLM (step6 already ran) to also return a `sessionTitle` field in its JSON output
- Actually simpler: step7 generates title from the question itself (no extra LLM call needed)
- Title format: Take student's first question, trim to 40 chars, capitalize

**Simpler approach (no LLM call):**
```js
// In step7, when messageCount === 0:
if (!session.messageCount || session.messageCount === 0) {
  const autoTitle = question.length > 40
    ? question.substring(0, 37).trim() + '...'
    : question.trim();
  stateUpdates.title = autoTitle; // Save to ChatSession directly
}
```

**Or LLM approach** (SESSION_DESIGN.md's preference — zero cost since same LLM call):
Add to tutorPrompt JSON contract: optional `sessionTitle` field for first turn.
step7 reads it and saves it. Only difference: smarter title ("Photosynthesis" not "Photosynthesis kya hai?")

**Decision:** Use LLM approach for better title quality. Add to tutorPrompt.

---

### P2-T4 — Token counting in pipeline
**Status: TODO**
**Files:** `backend/src/ask/step6.generateResponse.js`, `backend/src/ask/step7.saveAndRespond.js`, `backend/src/ask/step4.decideRetrieval.js`

**Strategy (from SESSION_DESIGN.md):** Use LLM provider's actual usage data.

**For OpenAI (current provider):** LangChain ChatOpenAI returns usage in the response.
Need to extract `usage.total_tokens` from the LLM response.

**In step6:** Return tokenUsage from LLM call along with response.
**In step7:** 
```js
// After pipeline completes:
const newTotal = (session.chatState?.totalTokensUsed || 0) + tokenUsage;
stateUpdates.totalTokensUsed = newTotal;
if (newTotal >= SESSION_TOKEN_LIMIT) {
  stateUpdates.isLocked = true;
}
```

**SESSION_TOKEN_LIMIT:** From env `SESSION_TOKEN_LIMIT` (default 15000).

**Lock check — BEFORE LLM call in step4:**
```js
if (chatState?.isLocked) {
  throw new SessionLockedError('Is session ki limit reach ho gayi...');
}
```

**Student message when locked:**
"Is session ki limit reach ho gayi hai. Nayi chat shuru karo wahan se continue kar sakte ho."
(From SESSION_DESIGN.md — exact text)

---

### P2-T5 — Backend: Sessions list API
**Status: TODO**
**File:** `backend/src/controllers/session.controller.js`, `backend/src/routes/session.routes.js`

**Endpoint:**
```
GET /api/v1/sessions
Auth: requireAuth (logged-in users only)
Response: { success: true, data: { sessions: [...] } }
```

**Query logic:**
```js
// Find all sessions for this userId, most recent first
// Cap at 20 sessions displayed (TBD from SESSION_DESIGN.md — using 20 as default)
const sessions = await ChatSession.find({ userId })
  .sort({ lastMessageAt: -1 })
  .limit(20)
  .select('sessionId title sessionType lastMessageAt isLocked messageCount')
  .lean();
```

**Response shape per session:**
```js
{
  sessionId: "uuid",
  title: "Photosynthesis kya hai?",
  sessionType: "global",
  lastMessageAt: "2026-06-14T...",
  isLocked: false,
  messageCount: 12,
}
```

**Guest behavior:** No endpoint call. Frontend checks auth state — if guest, skip API call, show login prompt in sidebar area.

---

### P2-T6 — Frontend: Sidebar component
**Status: TODO**
**Files:** 
- `frontend/src/components/Sidebar.jsx` (NEW — or update existing if it exists)
- `frontend/src/pages/ChatPage.jsx` (integrate sidebar)
- `frontend/src/api/tutorApi.js` (add fetchSessions())

**Sidebar UI spec (from SESSION_DESIGN.md):**
- Shows all sessions for logged-in user, most recent first
- Each entry: session title + date + sessionType (focus/global) badge
- Focus sessions also show: chapter name
- Locked sessions: show lock icon
- Active session: highlighted
- Click session → load that session's history
- "New Chat" button at top of sidebar (same action as Topbar button)
- Guest: "Apni study history save karne ke liye login karo." message + login button

**Layout:**
- Collapsible sidebar (hamburger or arrow toggle)
- On mobile: slides in as overlay
- On desktop: fixed width (240px) on left, chat area takes remaining space
- Sidebar toggle state: localStorage persisted (user preference)

**Session switching (click on a session in sidebar):**
1. Set sessionId to clicked session's sessionId
2. Save to localStorage
3. Fetch history for that sessionId
4. Replace messages state with loaded history
5. Restore studyMode (from sessionType: focus/global)
6. If focus session: restore chapterId too

**Edge case:** Clicking locked session → load history (read-only), show lock notice, disable AskBar.

---

### P2-T7 — Frontend: Session lock behavior
**Status: TODO**
**File:** `frontend/src/pages/ChatPage.jsx`, `frontend/src/components/AskBar.jsx`

**When session is locked:**
- Backend returns session.isLocked: true in response
- Frontend: disable AskBar, show message "Is session ki limit reach ho gayi..."
- "New Chat" button becomes highlighted/primary (call-to-action)

**Check on load too:** When loading session history (P1-T4), check sessionMeta.isLocked → disable AskBar if true.

---

## PHASE 2 COMPLETION CHECKLIST
- [x] P2-T1: userId saved correctly to DB for all logged-in users
- [x] P2-T2: ChatSession schema has sessionType, totalTokensUsed, messageCount (isLocked dropped — chatState.status=exhausted is single source of truth)
- [x] P2-T3: Session title auto-generated on first academic (study_tutor+answered) response — reuses response.title from step6, zero extra LLM cost, race-safe via { title: 'New Chat' } condition
- [x] P2-T4: Token counting working — LangChain callbacks capture step4+step6 usage, totalTokensUsed incremented atomically, session locks at 15k (chatState.status=exhausted), pre-pipeline ApiError passthrough fixed
- [ ] P2-T5: GET /api/v1/sessions returns correct session list for logged-in user
- [ ] P2-T6: Sidebar shows session list, session switching works
- [ ] P2-T7: Locked session: AskBar disabled, New Chat highlighted
- [ ] REGRESSION: Guest flow unaffected (no sidebar, can still chat)
- [ ] REGRESSION: Focus mode session switching works
- [ ] REGRESSION: All auth pages unaffected

---

## DEPENDENCY GRAPH

```
P1-T1 (session expiry)       ← NO dependency — start here
P1-T2 (New Chat button)      ← NO dependency — can do with T1
P1-T3 (GET history API)      ← NO dependency — backend only
P1-T4 (load history frontend) ← NEEDS P1-T3 done first

P2-T1 (userId in DB)         ← NEEDS Phase 1 complete
P2-T2 (schema update)        ← NEEDS P2-T1 (userId field already in schema — just adding new fields)
P2-T3 (session title)        ← NEEDS P2-T2
P2-T4 (token counting)       ← NEEDS P2-T2
P2-T5 (sessions list API)    ← NEEDS P2-T1 (userId must be in DB first)
P2-T6 (sidebar frontend)     ← NEEDS P2-T5
P2-T7 (lock behavior)        ← NEEDS P2-T4 + P2-T6
```

---

## WHAT NOT TO TOUCH (SESSION_DESIGN.md locked decisions)

1. Do NOT move messages into ChatSession document — keep separate chatHistory collection
2. Do NOT change the 15k token limit without discussion  
3. Do NOT allow Focus session chapterId to change mid-session
4. Do NOT build guest session merge (deferred — PROBLEMS.md FET entry)
5. Do NOT build quiz/exam integration here (future feature)
6. Do NOT migrate chatSession + chatHistory to ObjectId refs yet (deferred until auth stable)

---

## FILES THAT WILL CHANGE — COMPLETE LIST

### Phase 1:
| File | Change Type | Notes |
|------|------------|-------|
| `frontend/src/utils/session.js` | MODIFY | Add expiry logic, clearSessionId() |
| `frontend/src/pages/ChatPage.jsx` | MODIFY | handleNewChat(), load history on mount |
| `frontend/src/components/Topbar.jsx` | MODIFY | Add "New Chat" button |
| `frontend/src/api/tutorApi.js` | MODIFY | Add fetchSessionHistory() |
| `backend/src/controllers/session.controller.js` | NEW FILE | getSessionHistory() |
| `backend/src/routes/session.routes.js` | NEW FILE | GET /session/history route |
| `backend/src/app.js` | MODIFY | Register session routes |

### Phase 2:
| File | Change Type | Notes |
|------|------------|-------|
| `backend/src/controllers/ask.controller.js` | MODIFY | FIX-005: pass userId |
| `backend/src/ask/askOrchestrator.js` | MODIFY | FIX-005: accept + pass userId |
| `backend/src/ask/step7.saveAndRespond.js` | MODIFY | FIX-005: userId to DB + token counting + title |
| `backend/src/models/chatSession.model.js` | MODIFY | Add sessionType, totalTokensUsed, isLocked, messageCount |
| `backend/src/services/chatSession.service.js` | MODIFY | getOrCreateChatSession with userId, sessions list query |
| `backend/src/ask/step4.decideRetrieval.js` | MODIFY | Session lock check before LLM call |
| `backend/src/ask/step6.generateResponse.js` | MODIFY | Return tokenUsage + sessionTitle on first query |
| `backend/src/prompts/tutorPrompt.js` | MODIFY | Add sessionTitle to JSON contract for first query |
| `backend/src/controllers/session.controller.js` | MODIFY | Add getSessions() for sidebar |
| `backend/src/routes/session.routes.js` | MODIFY | Add GET /sessions route |
| `frontend/src/components/Sidebar.jsx` | NEW FILE | Session list sidebar |
| `frontend/src/pages/ChatPage.jsx` | MODIFY | Sidebar integration, session switching, lock state |
| `frontend/src/api/tutorApi.js` | MODIFY | Add fetchSessions() |

---

## DAILY PROGRESS LOG
# Add an entry each day when working on this.

| Date | Tasks Done | Blockers | Next |
|------|-----------|----------|------|
| 2026-06-15 | Phase 1 complete: session.js rewrite, New Chat button, history API (GET /sessions/:id/history), history load on refresh, userId in DB (FIX-005), logout fix, auth race condition guard, `payload.session.sessionId` bug fix | — | Phase 2: P2-T2 (schema) → P2-T3 (title) → P2-T4 (tokens) → P2-T5 (sessions list API) → P2-T6 (sidebar) → P2-T7 (lock UI) |
| 2026-06-16 | P2-T3 complete: session auto-title using response.title from step6 — zero extra LLM call, SYSTEM_TITLES guard for 'Chapter Complete!', race-safe updateOne, title now included in buildSessionPayload | — | P2-T4 (token counting) → P2-T5 (sessions list API) → P2-T6 (sidebar) → P2-T7 (lock UI) |
| 2026-06-16 | P2-T4 complete: LangChain callbacks in step4+step6 capture tokenUsage, orchestrator sums both and passes to step7, totalTokensUsed atomically incremented via topLevelInc, lock set via updateChatSessionState when newTotal >= SESSION_TOKEN_LIMIT, pre-pipeline ApiError passthrough fixed so exhausted message reaches student, step2 message updated per SESSION_DESIGN.md spec | — | P2-T5 (sessions list API) → P2-T6 (sidebar) → P2-T7 (lock UI) |
