# Zuno Token Blowup — Fix Plan

## Context & Goal

**Problem:** Session hits 15,000 token limit in 4–5 turns. Students get locked out too fast.  
**Root cause:** Redundant data sent multiple times per turn + wrong session metric.  
**Goal:** Student gets 30 meaningful learning turns per session without tutor quality dropping.

## What We Are NOT Doing (and Why)

| Approach | Reason Rejected |
|----------|----------------|
| Rule-based intent classifier | Kills intelligence — Hinglish is fluid, 7 intents switch mid-session |
| Merge decider + tutor into 1 call | Circular dependency: tutor needs retrieved chunks, chunks need decider's searchQuery |
| 8B model for decider | Fixes API cost, not token count. Wrong problem. |
| Conversation compression (summary call) | Adds a 3rd LLM call + race conditions. Not needed with 30-turn limit. |

## Architecture Decision: Keep Both LLM Calls, Make Both Leaner

Decider stays because it produces `searchQuery` (cleaned, Hinglish/English) for vector search.
Without it, raw Devanagari/Hinglish queries hit the vector store → poor retrieval → bad answers.

Strategy: **Remove redundancy and waste from both calls. Never remove signal.**

---

## Fix Steps (Ordered by Risk: Lowest First)

---

### STEP-0 — Instrumentation (Measure Before Fixing)
**Status:** `[x] DONE`  
**Estimated time:** 2–3 hours  
**Token savings:** 0 (foundation only)

**Why first:** Every subsequent fix needs numbers. Without this, we are guessing.

**What to log per LLM call:**
- Decider: input tokens, output tokens, intent classified, searchQuery
- Tutor: input tokens, output tokens, responseMode, status
- Per turn: combined token cost, cumulative session total, turn number

**Files to change:**
- `backend/src/ask/step4.decideRetrieval.js` — already has `capturedTokens`. Add structured log.
- `backend/src/ask/step6.generateResponse.js` — same.
- `backend/src/ask/step7.saveAndRespond.js` — log turn summary (turnNumber, deciderTokens, tutorTokens, sessionTotal).

**Log format (add to step7):**
```
[TOKEN AUDIT] Turn: 3 | Decider: 1842in/98out | Tutor: 4231in/712out | TurnTotal: 6883 | SessionTotal: 19420
```

**Test:** Start server, send 5 messages in one session. Confirm logs appear with real numbers for every turn.

**Risks:** None. Logging only, no behavior change.

---

### STEP-1 — Remove `lastTutorResponse` from Decider
**Status:** `[ ] TODO`  
**Estimated savings:** ~400 tokens per turn (every turn)  
**Risk:** Low

**Problem:**  
`lastTutorResponse` (the previous tutor answer, ~400 tokens) is sent to the decider separately.  
But it is ALREADY inside `history` as the last "Zuno:" entry. This is a direct duplicate.

**EXPLAIN_MORE concern (real edge case):**  
Decider uses `lastTutorResponse` to generate `searchQuery` for EXPLAIN_MORE intent.  
The prompt says: "Analyze Last Zuno Turn Response and extract the core topic."  
Fix: Update decider prompt to say "look at the most recent 'Zuno:' line in Recent Conversation Logs."  
The information is identical — it's just where the decider looks for it.

**Files to change:**
- `backend/src/ask/step3.buildContext.js` — still build `lastTutorResponse` (tutor still needs it)
- `backend/src/ask/step4.decideRetrieval.js` line 105 — remove `lastTutorResponse` from destructure
- `backend/src/ask/step4.decideRetrieval.js` line 113-120 — remove from `invoke()` call
- `backend/src/prompts/deciderPrompt.js` — remove `{lastTutorResponse}` template variable from human message. Update EXPLAIN_MORE instruction to reference history instead.

**Test:**
1. Send a science question (turn 1) → confirm STEP-0 shows ~400 fewer tokens in decider
2. Send "nahi samajha" (turn 2) → EXPLAIN_MORE must still generate a valid `searchQuery`
3. Confirm `searchQuery` field is not null and is topic-relevant

**Rollback:** Add `lastTutorResponse` back to step4 invoke call.

---

### STEP-2 — Fix RAG Chunk Double-Wrapping
**Status:** `[ ] TODO`  
**Estimated savings:** ~350 tokens per CONCEPT_QUESTION / EXPLAIN_MORE / NEXT_STEP turn  
**Risk:** Low

**Problem:**  
`markdownChunker.js` stores chunks with a `[Context]` header:
```
[Context]
Board: Bihar Board
Class: 10
Subject: Science
...
[Content]
actual educational text here
```

`promptHelpers.js → formatRetrievedContext` tries `metadata.originalText || chunk.content`.  
`metadata.originalText` **does not exist** in the chunk metadata (never was created).  
So it falls back to `chunk.content` = the full pageContent INCLUDING the `[Context]` header.  
Then `formatRetrievedContext` ALSO adds its own `[Source N] Chapter: ... Heading: ...` header on top.  
Result: every chunk sent to LLM has DOUBLE metadata headers. ~70 extra tokens × 5 chunks = 350 tokens wasted.

**Fix — strip the `[Context]` header at format time:**

```js
// backend/src/ask/promptHelpers.js
const extractChunkContent = (chunk) => {
  const raw = chunk.metadata?.originalText || chunk.content || '';
  const marker = '[Content]';
  const idx = raw.indexOf(marker);
  if (idx !== -1) return raw.slice(idx + marker.length).trim();
  return String(raw).replace(/\s+/g, ' ').trim();
};
```

Use `extractChunkContent(chunk)` instead of `compactText(metadata.originalText || chunk.content)` in `formatRetrievedContext`.

**No re-indexing needed.** The vector store is unchanged. Only how chunks are formatted for the prompt changes.

**Files to change:**
- `backend/src/ask/promptHelpers.js` — `formatRetrievedContext` function

**Test:**
1. Ask a science question that triggers RAG (CONCEPT_QUESTION)
2. Check logs: tutor input tokens should drop ~300–350
3. Verify answer quality is identical (content is same, just stripped metadata header)

**Edge case:** Chunk has no `[Content]` marker → fallback returns full content (current behavior). Safe.

**Rollback:** Revert `extractChunkContent` to old one-liner.

---

### STEP-3 — Compact Memory JSON + Replace `completedTopicIds` with Count
**Status:** `[ ] TODO`  
**Estimated savings:** ~50–120 tokens per turn (grows as student completes topics)  
**Risk:** Very low

**Problem A — Pretty-printed JSON:**  
`step3.buildContext.js` uses `JSON.stringify(formatMemoryForPrompt(chatState), null, 2)`.  
The `null, 2` adds newlines and indentation — tokens for whitespace.

**Fix A:**
```js
// step3.buildContext.js line 85
const memory = JSON.stringify(formatMemoryForPrompt(chatState));
// Remove the null, 2
```

**Problem B — `completedTopicIds` array grows unboundedly:**  
Every NEXT_STEP adds one ID. After 10 topics: `["t_01","t_02",...,"t_10"]` = ~80 tokens.  
After 20 topics: ~160 tokens. LLM only needs to know "how many topics done", not which ones.

**Fix B:**
```js
// backend/src/ask/promptHelpers.js — formatMemoryForPrompt
// Change this:
completedTopicIds: chatState?.completedTopicIds || [],
// To this:
completedTopicsCount: (chatState?.completedTopicIds || []).length,
```

**Files to change:**
- `backend/src/ask/step3.buildContext.js` line 85
- `backend/src/ask/promptHelpers.js` — `formatMemoryForPrompt` function

**Test:**
1. Verify session flow is unaffected (NEXT_STEP still works)
2. Check logs: ~50 fewer tokens in tutor input
3. After completing 5 topics, confirm memory JSON has `completedTopicsCount: 5` not an array

**Rollback:** Revert both changes independently.

---

### STEP-4 — Reduce Decider History Window (14 → 6 messages)
**Status:** `[ ] TODO`  
**Estimated savings:** ~300–700 tokens per decider call (grows with session length)  
**Risk:** Low-Medium

**Problem:**  
`step2.loadSession.js` fetches 14 messages: `getRecentChatHistory(sessionId, 14)`.  
Same 14 messages are sent to BOTH decider and tutor.  
Decider only needs recent context to resolve references ("iska", "aage", "yeh").  
Last 6 messages (3 turns) is enough for 99% of reference resolution.

**Fix — two separate history strings from the same fetched messages:**
```js
// backend/src/ask/step3.buildContext.js

// Already have: recentMessages (14 messages from DB)
const history = formatRecentHistory(recentMessages);           // full 14 for tutor
const deciderHistory = formatRecentHistory(recentMessages.slice(-6)); // last 6 for decider
```

Pass `deciderHistory` to step4, `history` to step6.

**Files to change:**
- `backend/src/ask/step3.buildContext.js` — build both histories
- `backend/src/ask/step4.decideRetrieval.js` — accept `deciderHistory` instead of `history`
- `backend/src/prompts/deciderPrompt.js` — no template change needed (`{history}` variable name stays)

**Edge case — old reference (>3 turns ago):**  
Student studied photosynthesis 5 turns ago, then: "us topic ko dobara batao."  
Decider's 6-message window won't have it. Decider will return `searchQuery: null`.  
Step 5 fallback: `chatState.lastTopic` (already tracked in DB).  
This fallback already exists in `step5.retrieveContent.js` line 91. Safe.

**Test:**
1. Session of 8 turns — check decider input drops ~400–600 tokens from turn 4 onwards
2. EXPLAIN_MORE test: say "nahi samajha" after recent science answer → must still work
3. Deep reference test: reference something from 5 turns ago → may need to repeat topic name (acceptable degradation)

**Rollback:** Use `recentMessages` for both histories again.

---

### STEP-5 — Conditional `curriculumSummary` (only when needed)
**Status:** `[ ] TODO`  
**Estimated savings:** ~450 tokens on ~80% of turns  
**Risk:** Low-Medium

**Problem:**  
`curriculumSummary` (~450 tokens — all 16 chapters listed) is sent to tutor on EVERY call.  
It is only actually needed when:
- Intent is `CHOOSE_COURSE` (student picking a chapter)
- Global mode with no active chapter (student browsing)  
Greeting, explanation, concept question — don't need the full curriculum list.

**Fix:**
```js
// backend/src/ask/step6.generateResponse.js

const needsCurriculum = (intent, focusChapterPrompt) => {
  if (intent === 'CHOOSE_COURSE') return true;
  if (focusChapterPrompt === 'No focus chapter selected.') return true;
  return false;
};

// In generateResponse call:
const curriculumForPrompt = needsCurriculum(intent, focusChapterPrompt)
  ? curriculumSummary
  : 'Not needed for this response type.';
```

Pass `curriculumForPrompt` to the tutor invoke instead of `curriculumSummary`.

**Files to change:**
- `backend/src/ask/step6.generateResponse.js` — add `needsCurriculum` check, use in invoke
- `backend/src/prompts/tutorPrompt.js` — no change needed

**Edge case — CHOOSE_COURSE timing:**  
Decider has already run before step6. `intent` from `decision` is available. Safe to use.

**Edge case — Global mode fresh session:**  
`focusChapterPrompt === 'No focus chapter selected.'` catches this correctly.

**Test:**
1. Ask greeting → tutor input should drop ~450 tokens
2. Ask "Physics padhna hai" (CHOOSE_COURSE) → curriculum IS included, chapters listed correctly
3. In focus mode, ask science question → curriculum NOT included, answer quality same

**Rollback:** Always pass `curriculumSummary` instead of `curriculumForPrompt`.

---

### STEP-6 — Set `maxTokens` on LLM Calls
**Status:** `[ ] TODO`  
**Estimated savings:** ~200–400 tokens average per turn (prevents verbose runaway output)  
**Risk:** Low (with correct values)

**Problem:**  
No `maxTokens` set. LLM can generate 1,500–2,000 token responses. All counted against session limit.

**Values:**
- Decider: `maxTokens: 250` — JSON output is ~80–120 tokens. Generous buffer.
- Tutor: `maxTokens: 1200` — enough for a complete, quality science explanation.

**Files to change:**
- `backend/src/ask/step4.decideRetrieval.js` — `createChatModel({ maxTokens: 250 })`
- `backend/src/ask/step6.generateResponse.js` — `createChatModel({ temperature: 0.3, maxTokens: 1200 })`
- `backend/src/llm/chatModel.js` — pass `maxTokens` through to each provider

**JSON truncation risk:**  
If tutor hits 1,200 limit mid-JSON, `parseJsonObject` fails → fallback response triggers.  
With Phase 1 fixes (lean input), tutor has ~7,500 token input budget well within Groq's 128k window.  
1,200 tokens output is sufficient for quality answers. Monitor for truncation in logs.

**Never set below 800** for tutor. Better to be slightly generous than risk frequent truncation.

**Test:**
1. Check STEP-0 logs — tutor output tokens should average below 1,000
2. Trigger verbose question (multi-part concept) — confirm answer is complete, not cut off
3. If truncation logged, increase limit to 1,400

---

### STEP-7 — Turn-Based Session Limit
**Status:** `[ ] TODO`  
**Estimated impact:** Students get 30 turns instead of 4–5  
**Risk:** Low (additive, doesn't break existing token limit)

**Why this matters (product perspective):**  
Current: Student pays "session budget" for infrastructure plumbing (system prompts, history re-sends).  
After all fixes, per-turn cost is ~3,500–5,000 tokens. At 15k limit, still only 3–4 turns.  
**Turn-based limit aligns with the actual goal: "student can ask more questions."**

**`messageCount` already exists** in `chatSession.model.js` — incremented every turn in `step7.saveAndRespond.js`.  
We already count turns. We just need to enforce the limit on it.

**Files to change:**

`backend/.env`:
```
SESSION_TURN_LIMIT=30
SESSION_TOKEN_LIMIT=150000
```

`backend/src/config/env.js`:
```js
sessionTurnLimit: toNumber(process.env.SESSION_TURN_LIMIT, 30),
sessionTokenLimit: toNumber(process.env.SESSION_TOKEN_LIMIT, 150000),
```

`backend/src/ask/step2.loadSession.js` — add turn check after token check:
```js
// After the exhausted status check, add:
const currentTurns = chatState.messageCount ?? 0;
if (currentTurns >= env.sessionTurnLimit) {
  throw new ApiError(429, `Is session ke ${env.sessionTurnLimit} turns complete ho gaye. Nayi chat shuru karo — sab yaad rahega!`);
}
```

`backend/src/ask/step7.saveAndRespond.js` — update exhaustion check to use BOTH limits:
```js
const newMessageCount = updatedSession?.chatState?.messageCount ?? 0;
const newTotal = updatedSession?.totalTokensUsed ?? 0;

const turnLimitHit = newMessageCount >= env.sessionTurnLimit;
const tokenSafetyHit = newTotal >= env.sessionTokenLimit; // safety net only

if (turnLimitHit || tokenSafetyHit) {
  await updateChatSessionState(sessionId, { status: 'exhausted' }, userId);
  console.log(`[Step 7] Session locked — Turns: ${newMessageCount}/${env.sessionTurnLimit} | Tokens: ${newTotal}/${env.sessionTokenLimit}`);
}
```

**Test:**
1. Set `SESSION_TURN_LIMIT=3` temporarily
2. Send 3 messages → 4th should return 429 with student-friendly message
3. Restore `SESSION_TURN_LIMIT=30`
4. Verify token safety net still works (set token limit very low, confirm it also locks)

---

### STEP-8 — Prompt Caching (Verify + Enable)
**Status:** `[ ] TODO`  
**Estimated savings:** 60–70% reduction on system prompt tokens IF supported  
**Risk:** Low (if supported; no behavior change)

**What it does:**  
System prompts are static (~900 + ~1,700 = 2,600 tokens). Providers cache them server-side.  
Subsequent calls within cache TTL pay ~10% of normal (cache read rate, not full token rate).  
**Zero code change to prompts needed** — just verify and configure.

**Action:**
1. Check Groq docs: does `llama-3.3-70b-versatile` support prompt caching as of current date?
2. If yes: enable via `ChatGroq` constructor parameter (check LangChain docs)
3. If no: check if OpenAI (`gpt-4o-mini`) or Google Gemini Flash supports it as fallback

**Requirement:** System messages must be 100% static (no dynamic data injected).  
Both `deciderPrompt.js` and `tutorPrompt.js` have fully static system messages. ✅

**Test:** Look for "cache_read_input_tokens" in API response. Groq/OpenAI include this in usage stats.

---

## Combined Expected Impact

| After | Per-Turn Tokens | Session Turns at 150k |
|-------|----------------|----------------------|
| Today (broken) | 7,000–11,000 | 3–5 turns |
| After STEP 0–3 (redundancy) | 5,500–7,500 | 10–15 turns |
| After STEP 4–6 (lean inputs) | 4,000–5,500 | 20–27 turns |
| After STEP 7 (turn limit) | 4,000–5,500 | 30 turns (capped) |
| After STEP 8 (caching) | ~2,500–3,500 effective | 30 turns comfortable |

**Goal achieved: 30 quality learning turns per session.** Tutor quality: unchanged.

---

## Execution Rules

1. **One step at a time.** Complete → test → mark done → then next.
2. **STEP-0 logging must be done first.** Every other step needs it.
3. **Each step is independently reversible.** If something breaks, rollback that step only.
4. **Test after every step**, not at the end.
5. **Never touch retrieval logic, tutor prompt quality, or intent classification rules** without a separate discussion.

---

## Status Tracker

```
[x] STEP-0  Instrumentation (logging)
[x] STEP-1  Remove lastTutorResponse from decider
[x] STEP-2  Fix RAG chunk double-wrapping
[x] STEP-3  Compact memory JSON + completedTopicIds → count
[ ] STEP-4  Decider history window 14 → 6
[ ] STEP-5  Conditional curriculumSummary
[ ] STEP-6  Set maxTokens on LLM calls
[ ] STEP-7  Turn-based session limit (30 turns)
[ ] STEP-8  Prompt caching (verify + enable)
```

---

*Last updated: 2026-06-16*  
*Context: Deep analysis session — full root cause audit + solution design*
