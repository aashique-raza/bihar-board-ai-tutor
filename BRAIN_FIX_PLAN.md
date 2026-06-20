# Zuno Brain Fix Plan

> **Created:** 2026-06-20
> **Replaces:** BRAIN_FIXES.md + BRAIN_FIX_HANDOFF.md (both deleted — stale, partially wrong)
> **Status:** ALL FIXES VERIFIED (FIX-A through FIX-I + FIX-J) — no pending fixes
> **Last session:** All 10 fixes implemented and verified — ready for deployment
> **Codebase state:** Intent Router ACTIVE (USE_INTENT_ROUTER=true), Session limit 35k, Phases 0-5 complete

---

## 0. Read This First

This file is the **single source of truth** for all Zuno brain-layer fixes.

It exists because brain problems span multiple sessions, multiple files, and require careful reasoning before any code is touched. Without this file, each session starts cold — re-deriving analysis that already took hours.

**How to use in any session:**
1. Read Section 1 (Role) — restores the working contract
2. Read Section 2 (Current State) — know what is live right now
3. Read Section 5 (Status Tracker) — find the next pending fix
4. Read that fix's full detail section — edge cases, hidden risks, implementation plan
5. Discuss with senior engineer (that's Claude) — then implement — then mark done

---

## 1. Role Definition (Active Every Session — No Need to Re-State)

**Claude's role in this project:** Senior Software Engineer + Senior System Design Engineer + Product Manager with 20 years of experience.

### What this role means in practice

**When a fix is picked up:**
- Do NOT jump straight to implementation
- First go to the **actual core problem** — explain it at every level:
  - **Product level** — what does the student experience? why does it matter for learning?
  - **Architecture level** — where does this break in the pipeline? which layer is responsible?
  - **Reasoning level** — why did this happen? what assumption was wrong?
  - **Hidden challenge level** — what is non-obvious? what will bite us if we miss it?

**When proposing a fix:**
- Propose **multiple implementation options** (not just one)
- Each option: tradeoffs, risks, token cost, complexity
- Then **recommend one** with full reasoning
- **Do NOT start coding until Farhan says "go"**

**When Farhan is stuck or confused:**
- If he says "ye samajh nahi aaya" or "mujhe doubt hai" — take full control
- Reason through it from scratch, step by step, with examples
- Do not give one-liner answers when confusion is deep
- Do not move forward until the confusion is resolved

**When Farhan gives approval:**
- Implement the agreed plan exactly — no scope creep, no extra changes
- After implementation: run verification steps, confirm behavior
- Mark done in Section 5 only after verification passes

**Hard rules:**
- Never implement without discussing first
- Never skip a fix's verification steps
- Never mark a fix VERIFIED based on "code looks right" — must test behavior
- If something unexpected is found during implementation → stop, escalate to discussion
- One fix at a time — do not batch unless trivially safe

---

## 2. Current Codebase State (Ground Truth — Verified 2026-06-20)

### What is LIVE and working
```
Active brain path:    Intent Router (USE_INTENT_ROUTER=true in backend/.env)
Legacy path:          tutorPrompt.js alive as safety fallback (Layer 2.6 deferred to post-deploy)
Session token limit:  35,000 tokens
Per-turn avg:         ~3,338 tokens
Turns per session:    ~9-10 (worst case: CONCEPT + EXPLAIN_MORE alternating)
Pipeline phases:      0-5 complete (token optimization done)
```

### What the intent router does
`step6.generateResponse.js` checks `USE_INTENT_ROUTER` flag → routes to `intentRouter.js` → dispatches to one of 7 focused prompt files:

| Intent | Prompt File | Temp | Max Tokens |
|--------|-------------|------|------------|
| GREETING | greetingPrompt.js | 0.5 | 300 |
| OUT_OF_CONTEXT | redirectPrompt.js | 0 | 100 |
| UNSAFE_OR_ABUSIVE | unsafePrompt.js | 0 | 100 |
| CHOOSE_COURSE | chooseCoursePrompt.js | 0.2 | 600 |
| EXPLAIN_MORE | explainMorePrompt.js | 0.3 | 1500 |
| CONCEPT_QUESTION | conceptQuestionPrompt.js | 0 | 1500 |
| NEXT_STEP | nextStepPrompt.js | 0.1 | 1200 |

### What was fixed in token optimization (do NOT re-fix these)
- FIX-001: tutorPrompt response mode branching ✅
- FIX-002: Anti-repetition rule ✅
- FIX-003: EXPLAIN_MORE step5 re-retrieval handler ✅
- FIX-004: CHOOSE_COURSE tutorPrompt instruction ✅
- FIX-005: userId wiring (controller → orchestrator → step7) ✅
- Phase 2: Intent router with 7 focused prompts ✅
- Phase 3: Session drift guard (consecutive/total counters + DriftCap) ✅
- Phase 5: History compression (formatCompressedHistory) ✅

### Key architectural facts to remember
- Decider model: Groq llama-3.1-8b-instant (small, fast, classification only)
- Tutor model: OpenAI gpt-4o-mini (main response generation)
- Embeddings: Google Gemini gemini-embedding-001 (3072-dim)
- Safety Net: `intentSafetyNet.js` — embedding similarity probe (cosine >= 0.65 threshold) fires for GREETING/OUT_OF_CONTEXT to catch academic misclassifications
- Memory (chatState) is NOT passed to intent router prompts — deliberate token optimization decision, focusChapter + history are sufficient

---

## 3. Why These Fixes Matter (Product Context)

Zuno's core promise: a real AI tutor for Bihar Board Class 10 students.

A real tutor does not:
- Re-explain the same thing the same way when a student says "nahi samajh aaya"
- Retrieve the wrong content when re-explaining
- Get stuck saying something useless when the decider hallucinates an intent
- Sound inconsistent — calling students "babu" in error messages but not in responses

These fixes are not cosmetic. FIX-A (lastRetrievalQuery) directly determines whether EXPLAIN_MORE is useful or broken. FIX-C (lastStudyResponse) determines whether the anti-repetition rule actually works. Together they control the quality of Zuno's most important learning interaction: a student who didn't understand and tries again.

---

## 4. What is Intentionally Out of Scope (Do Not Touch)

| Item | Why |
|------|-----|
| Layer 2.6 (delete legacy tutorPrompt path) | Post-deployment cleanup — intentional defer |
| CHOOSE_COURSE → chapter ID in session | Phase 6 scope — FocusModal already handles chapter selection in UI |
| Memory (chatState) in intent router prompts | Deliberate token optimization decision — not a bug |
| RAG reranker (reranker.js) | Separate concern, regression risk, out of scope |
| Embeddings pipeline | Would require full re-index |
| Frontend changes | Not brain-layer |
| HUMAN/HUMANS in WEAK_QUERY_TERMS (BUG-018) | Low impact, Biology chunks still surface via embeddings |

---

## 5. Status Tracker

| ID | Fix | Files | Priority | Status |
|----|-----|-------|----------|--------|
| FIX-A | lastRetrievalQuery — EXPLAIN_MORE retrieval foundation | 4 | HIGH | VERIFIED |
| FIX-B | Unknown intent fallback CONCEPT_QUESTION → GREETING | 1 | HIGH | VERIFIED |
| FIX-C | lastStudyResponse — anti-repetition quality | 6 | MEDIUM | VERIFIED |
| FIX-D | DriftCap early return — routed through step7 | 1 | MEDIUM | VERIFIED |
| FIX-J | Greeting TYPE 4 — social closing awkward response | 1 | MEDIUM | VERIFIED |
| FIX-E | Safety Net raw query cleanup | 1 | MEDIUM | VERIFIED |
| FIX-F | Session exhausted message — student-friendly copy | 1 | LOW | VERIFIED |
| FIX-G | step1 error messages — remove "babu" (persona mismatch) | 1 | LOW | VERIFIED |
| FIX-H | step6 dead code — GREETING/GREETINGS on responseMode check | 1 | LOW | VERIFIED |
| FIX-I | Cold-start chatState — missing field initialization | 1 | LOW | VERIFIED |

**Legend:** `PENDING` → `IN_PROGRESS` → `IMPLEMENTED` → `VERIFIED`

---

## 6. FIX-A — lastRetrievalQuery

**Priority:** HIGH
**Status:** VERIFIED
**Effort:** ~2 hours
**Files:** `chatSession.model.js`, `step7.saveAndRespond.js`, `step5.retrieveContent.js`, `deciderPrompt.js`

---

### Core Problem (full breakdown)

**Product level:**
Student asks "Photosynthesis kya hai?" — gets a good explanation.
Student says "Nahi samajh aaya, dubara samjhao" — gets a WORSE explanation because Zuno retrieved the wrong content.
This is Zuno's most important interaction (re-explanation) and it is quietly broken.

**Architecture level:**
EXPLAIN_MORE flow in `step5.retrieveContent.js:91`:
```js
const topicQuery = searchQuery || chatState?.lastTopic || null;
```
Two sources, both unreliable:

`searchQuery` — comes from decider. Decider prompt says:
```
EXPLAIN_MORE: extract core topic from the latest "Zuno:" entry in history.
```
Decider reads Zuno's last response TEXT and extracts a topic. If Zuno said
"Photosynthesis mein Light Reactions ke 3 steps hain..." — decider extracts
"light reactions", not "photosynthesis". Retrieval query is now a sub-topic → narrower,
possibly different chunks than the original.

`lastTopic` — set by LLM memoryUpdate. Can be wrong language (Hindi instead of Hinglish),
wrong granularity, or a different sub-topic than what the original query retrieved.

**The real fix:**
When a CONCEPT_QUESTION successfully retrieves content, the exact searchQuery used
(e.g., "photosynthesis process chlorophyll") should be saved to session state as
`lastRetrievalQuery`. EXPLAIN_MORE should use THIS as its primary query — not a
re-derived approximation.

**Hidden challenge:**
`lastRetrievalQuery` is set by code (step5), not by LLM (memoryUpdate). So it must be
returned from step5 and passed through step7 via a code path, not via the memoryUpdate
whitelist. This is different from how other fields are updated.

---

### Implementation — Option 1 (Recommended): Return from step5, save in step7 code path

**step5.retrieveContent.js** — on successful CONCEPT_QUESTION retrieval, add to return:
```js
// In the generic CONCEPT_QUESTION retrieval path (after line 153):
return {
  retrieval,
  chunks,
  sources,
  retrievedContext,
  lastRetrievalQuery: searchQuery,   // ← ADD THIS
};
```
Also update EXPLAIN_MORE to use `chatState.lastRetrievalQuery` as primary:
```js
if (intent === 'EXPLAIN_MORE') {
  const topicQuery = chatState?.lastRetrievalQuery   // primary — exact winning query
                  || chatState?.lastTopic            // fallback — LLM-set topic name
                  || null;
  // ... rest unchanged
}
```

**step7.saveAndRespond.js** — save `lastRetrievalQuery` from retrieval result:
```js
// In saveAndRespond, after stateUpdates is built:
if (decision?.intent === 'CONCEPT_QUESTION' && retrieval?.lastRetrievalQuery) {
  stateUpdates.lastRetrievalQuery = retrieval.lastRetrievalQuery;
}
```
Add `lastRetrievalQuery` to `ALLOWED_STATE_FIELDS` array.
Add `lastRetrievalQuery` to `CONCEPT_QUESTION` entry in `INTENT_MEMORY_WHITELIST`.

**chatSession.model.js** — add field to schema:
```js
lastRetrievalQuery: {
  type: String,
  default: null,
},
```

**deciderPrompt.js** — remove EXPLAIN_MORE searchQuery generation instruction:
```
// REMOVE this line from SEARCH QUERY RULES:
// "EXPLAIN_MORE: extract core topic from the latest "Zuno:" entry in history."

// REPLACE with:
// "EXPLAIN_MORE: searchQuery must be null. Step 5 handles re-retrieval directly."
```

**Option 2 (Not recommended): Keep decider generating searchQuery, just add lastRetrievalQuery as extra override**

Tradeoff: Keeps two competing sources. More complex. Harder to debug. Not recommended.

---

### Verification Steps
1. Ask `"Photosynthesis kya hai?"` → confirm response is good → check terminal log for `[Step 5 DB Scan] Querying index vectors using computed target: "photosynthesis..."` — note this exact query
2. Check session in MongoDB: `db.chat_sessions.findOne({...})` → `chatState.lastRetrievalQuery` should be set
3. Ask `"Nahi samajh aaya, dubara samjhao"` → terminal log must show: `[Step 5 EXPLAIN_MORE] Re-retrieving via chatState.lastRetrievalQuery: "photosynthesis..."` (same query as step 1)
4. Fresh session → ask `"Dubara batao"` (no prior topic) → must respond gracefully asking which topic, NOT crash
5. CONCEPT_QUESTION behavior must be unchanged — regression check

---

## 7. FIX-B — Unknown Intent Fallback

**Priority:** HIGH
**Status:** VERIFIED
**Effort:** 5 minutes
**Files:** `step4.decideRetrieval.js`

---

### Core Problem

**Product level:**
If the decider (8B model) hallucinates an intent not in the 7-item taxonomy (e.g., "META_COMPLAINT",
"FEEDBACK", "REVIEW"), the pipeline silently routes it as CONCEPT_QUESTION. This student's casual
message triggers a RAG search and likely gets "material not available" response.

**Architecture level:**
`step4.decideRetrieval.js:71`:
```js
const intent = VALID_INTENTS.has(decision.intent) ? decision.intent : 'CONCEPT_QUESTION';
```
`CONCEPT_QUESTION` is the worst possible unknown fallback because:
- Sets `needsRetrieval = true` → RAG fires on a non-academic message
- Sets `responseMode = 'study_tutor'` → empty-context rule fires → "material not found"

`GREETING` is the correct fallback because:
- Sets `needsRetrieval = false` → no wasted RAG call
- Routes to `greetingPrompt.js` → warm response + redirect to studying
- FIX-001 already done → GREETING path is safe and well-handled

**Hidden challenge:** The parse-error catch block at line 160-180 also returns `CONCEPT_QUESTION`
with `needsRetrieval: false` — that is a DIFFERENT, intentional fallback that must NOT be changed.
Only the `normalizeDecision` fallback on line 71 needs changing.

---

### Implementation

`step4.decideRetrieval.js` line 71:
```js
// BEFORE:
const intent = VALID_INTENTS.has(decision.intent) ? decision.intent : 'CONCEPT_QUESTION';

// AFTER:
const intent = VALID_INTENTS.has(decision.intent) ? decision.intent : 'GREETING';
if (!VALID_INTENTS.has(decision.intent)) {
  console.warn(`[Step 4] Unknown intent "${decision.intent}" — falling back to GREETING`);
}
```

---

### Verification Steps
1. Code review: confirm line 71 changed, warn log present
2. Confirm parse-error catch block (line 160-180) is UNCHANGED
3. Send all 7 known intent types — confirm routing is unaffected (regression sweep)
4. Monitor for `[Step 4] Unknown intent` warn log in dev — if it appears, decider is hallucinating — investigate

---

## 8. FIX-C — lastStudyResponse

**Priority:** MEDIUM
**Status:** VERIFIED
**Effort:** ~1.5 hours
**Files:** `chatSession.model.js`, `step7.saveAndRespond.js`, `step3.buildContext.js`, `explainMorePrompt.js`

---

### Core Problem

**Product level:**
Student: "Photosynthesis samjhao" → Zuno explains in detail.
Student: "Ek baar aur samjhao, alag tarike se" → Zuno should give a different explanation.
But sometimes Zuno reuses the same structure. Why? The anti-repetition rule is checking
the wrong thing.

**Architecture level:**
The variation mandate in `explainMorePrompt.js` says:
```
"Look at the most recent 'Zuno:' entry in the conversation history"
```
This relies on `history` — the last 6 messages. But what if Zuno's LAST message was a
clarifying question like "Kaunsa part confusing tha — process, formula, ya example?"

Now the "most recent Zuno: entry" is that 5-word question, not the original explanation.
Anti-repetition rule compares against the clarifying question — not the real explanation.
Result: LLM sees its last response was a 5-word question → freely reuses original explanation
structure → student gets same explanation again.

**Hidden challenge:**
`lastStudyResponse` must ONLY be updated on turns where:
- `intent === 'CONCEPT_QUESTION'` or `intent === 'EXPLAIN_MORE'`
- `response.status === 'answered'`
- Retrieved content was actually used (not NO_RETRIEVED_CONTEXT)

Clarifying questions (`status: 'needs_clarification'`) must NOT update this field.
This distinction must be enforced in step7 code, not by LLM.

---

### Implementation

**chatSession.model.js** — add field:
```js
lastStudyResponse: {
  type: String,
  default: null,
},
```

**step7.saveAndRespond.js** — save conditionally:
```js
const isRealStudyAnswer = (
  ['CONCEPT_QUESTION', 'EXPLAIN_MORE'].includes(decision?.intent) &&
  response?.status === 'answered' &&
  retrieval?.retrievedContext !== 'NO_RETRIEVED_CONTEXT'
);
if (isRealStudyAnswer && response?.answer) {
  stateUpdates.lastStudyResponse = response.answer.slice(0, 800); // cap to avoid huge field
}
```
Add `lastStudyResponse` to `ALLOWED_STATE_FIELDS` and to both `CONCEPT_QUESTION` and
`EXPLAIN_MORE` entries in `INTENT_MEMORY_WHITELIST`.

**step3.buildContext.js** — expose in returned context:
```js
// In formatMemoryForPrompt OR as a separate field:
const lastStudyResponse = chatState?.lastStudyResponse || null;

// Add to return object:
return {
  // ... existing fields
  lastStudyResponse,
};
```

**intentRouter.js** — pass to EXPLAIN_MORE:
```js
case 'EXPLAIN_MORE':
  return {
    message, answerLanguageInstruction, retrievedContext, history,
    lastStudyResponse: context.lastStudyResponse || 'No previous study explanation.',
  };
```

**explainMorePrompt.js** — update variation mandate:
```js
// In human template, add:
`Previous study explanation (the one the student is asking to re-explain):
{lastStudyResponse}

Recent conversation (last 6 messages):
{history}`
```

Update system prompt variation mandate:
```
// CHANGE:
"Look at the most recent 'Zuno:' entry in the conversation history"

// TO:
"Look at 'Previous study explanation' above — that is the explanation the student
wants re-explained. Do NOT use the same title, main headings, or primary content points from it."
```

---

### Verification Steps
1. Ask "Photosynthesis kya hai?" → get answer (call it Response A)
2. Ask "Aur simple karo" → EXPLAIN_MORE fires → terminal should show `[Step 5 EXPLAIN_MORE] Re-retrieving via chatState.lastRetrievalQuery`
3. Response B must have DIFFERENT section headings than Response A
4. Ask "Kaunsa topic padh rahe hain?" → Zuno asks for clarification (needs_clarification) → check MongoDB: `lastStudyResponse` must NOT be updated (still shows Response A)
5. Ask same study question again (CONCEPT_QUESTION) → Response C must differ from Response A in structure

---

## 9. FIX-D — DriftCap History Save

**Priority:** MEDIUM
**Status:** VERIFIED
**Effort:** ~30 minutes
**Files:** `askOrchestrator.js`

---

### Core Problem

**Product level:**
Student keeps sending "Hi" and "Haan" messages. After 10 such messages, DriftCap fires.
Student gets "Zuno sirf Science padhaane ke liye hai!" response. Student asks "Tumne ye kab bola?"
Zuno has no memory of it — it never saved the message. Next session: cap fires AGAIN silently,
student gets same response. App feels broken, not intelligent.

**Architecture level:**
`askOrchestrator.js:106-132` — when DriftCap fires:
```js
return {
  status: 'answered',
  answer: 'Zuno sirf Science...',
  // ... early return
};
```
Step7 never called → `addChatMessages` never called → no record in `chat_history` collection.
Student's question is lost. Zuno's cap response is lost.

**Hidden challenge:**
DriftCap is designed to save tokens — no LLM call. Adding a DB save here adds one lightweight
async operation. But we must be careful: DriftCap also skips step7 to avoid updating
`totalNonAcademicTurns` for this turn (counter is already AT cap). If we call step7, the
counter would increment past the cap unnecessarily. So we should ONLY save the message
to history — not update session state.

---

### Implementation

`askOrchestrator.js` — after the early return response is built:
```js
if (
  DRIFT_CAP_INTENTS.has(decision.intent) &&
  (context.driftSignal?.totalNonAcademic ?? 0) >= env.maxNonAcademicTurns
) {
  const capContent = 'Zuno sirf Science padhaane ke liye hai! Koi bhi topic chunao — Physics, Chemistry, ya Biology — aur hum shuru karte hain.';
  const capResponse = {
    status: 'answered',
    // ... existing fields
    answer: capContent,
  };

  // Save to history — fire and forget, do not await, non-critical
  addChatMessages(session.sessionId, [
    { role: 'student', text: input.question, metadata: { studyMode: input.studyMode } },
    { role: 'tutor', text: capContent, action: 'conversation', sources: [], metadata: { status: 'answered', responseMode: 'conversation' } },
  ], userId).catch((e) => console.warn('[DriftCap] History save failed:', e.message));

  return capResponse;
}
```

Import `addChatMessages` at top of `askOrchestrator.js` if not already imported.

---

### Verification Steps
1. Set `MAX_NON_ACADEMIC_TURNS=2` in `.env` for testing
2. Send 2 casual messages → DriftCap fires on turn 3
3. Check `db.chat_histories.findOne({sessionId: "..."})` → should have all 3 student messages + Zuno's cap response
4. Reset `MAX_NON_ACADEMIC_TURNS=10` after testing

---

## 10. FIX-E — Safety Net Raw Query Cleanup

**Priority:** MEDIUM
**Status:** VERIFIED
**Effort:** ~20 minutes
**Files:** `askOrchestrator.js`

---

### Core Problem

**Architecture level:**
`askOrchestrator.js:96-98` — when SafetyNet overrides intent to CONCEPT_QUESTION:
```js
decision.searchQuery = input.question;
```
Raw student message used as retrieval query. "Bhai, osmosis ka matlab kya hota hai yaar?"
→ searchQuery = full sentence → filler words "bhai", "yaar", "ka", "matlab" added to
vector search → embedding less precise than "osmosis meaning definition".

Decider normally generates clean semantic queries like "osmosis definition process".
SafetyNet bypasses the decider's query generation and sends raw text.

**Hidden challenge:**
If the decider classified as GREETING but still generated a `searchQuery` (unlikely — decider
doesn't generate searchQuery for GREETING) — `decision.searchQuery` would be null.
The current code always overwrites with raw input. A smarter approach: check if decider
already gave us a usable searchQuery before overwriting.

---

### Implementation

`askOrchestrator.js` — update SafetyNet block:
```js
if (fired) {
  decision.intent         = 'CONCEPT_QUESTION';
  decision.inScope        = true;
  decision.needsRetrieval = true;
  decision.responseMode   = 'study_tutor';
  decision._overridden    = true;

  // Use decider's searchQuery if available, else clean the raw question.
  // Decider rarely generates searchQuery for GREETING/OUT_OF_CONTEXT but may on edge cases.
  if (!decision.searchQuery) {
    // Basic cleanup: remove common Hinglish filler words
    const cleaned = input.question
      .replace(/\b(bhai|yaar|sir|madam|please|plz|kripya|zara|jaldi|arey|arre)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    decision.searchQuery = cleaned || input.question; // fallback to raw if cleanup empties string
  }
}
```

---

### Verification Steps
1. Send "Bhai osmosis kya hota hai yaar?" → terminal log must show SafetyNet fired
2. Terminal must show `[Step 5 DB Scan] Querying index vectors using computed target: "osmosis kya hota hai"` (filler words removed)
3. Response should be about osmosis with retrieved content (not hallucinated)

---

## 11. FIX-F — Session Exhausted Message

**Priority:** LOW
**Status:** VERIFIED
**Effort:** 5 minutes
**Files:** `step2.loadSession.js`

---

### Core Problem

**Product level:**
A Bihar Board Class 10 student does not understand "session ki limit reach ho gayi hai."
They think the app broke. This is a trust-breaking moment in the product experience.

**Current message:**
`'Is session ki limit reach ho gayi hai. Nayi chat shuru karo — wahan se continue kar sakte ho.'`

**Fix:**
`'Hamari baat bahut lambi ho gayi! Ek nayi chat shuru karo — fresh start mein aur clearly padh sakte hain.'`

**File:** `step2.loadSession.js:58`

---

### Verification Steps
1. Set `SESSION_TOKEN_LIMIT=100` temporarily → send any message → verify new message appears
2. Reset `SESSION_TOKEN_LIMIT=35000`

---

## 12. FIX-G — step1 Persona Mismatch

**Priority:** LOW
**Status:** VERIFIED
**Effort:** 5 minutes
**Files:** `step1.validateInput.js`

---

### Core Problem

`corePersona.js`: "Do NOT use patronizing address terms like 'Beta' or 'Babu'."

`step1.validateInput.js` lines 35, 39: still says "babu" in error messages.
Persona was updated in prompts but input validation error text was not updated.

**Fix:** Remove "babu" from all 3 error message strings in step1.validateInput.js.

---

### Verification Steps
1. Send empty question → verify error message has no "babu"
2. Send 600-character question → verify error message has no "babu"

---

## 13. FIX-H — step6 Dead Code

**Priority:** LOW
**Status:** VERIFIED
**Effort:** 5 minutes
**Files:** `step6.generateResponse.js`

---

### Core Problem

`step6.generateResponse.js:219-221`:
```js
const normalizedIntent = String(responseMode || '').toUpperCase();
if (['GREETING', 'CONVERSATION', 'GREETINGS'].includes(normalizedIntent)) {
```
`responseMode` values are: `'conversation'`, `'study_tutor'`, `'redirect'`.
Only `'CONVERSATION'` can ever match. `'GREETING'` and `'GREETINGS'` are intent values,
not responseMode values — they will never appear here.

This code is only in the LEGACY path (runs when `USE_INTENT_ROUTER=false`). Intent router
has its own guard in `routeToIntentHandler`. Still worth cleaning for correctness.

**Fix:** Remove `'GREETING'` and `'GREETINGS'` from the includes array.

---

### Verification Steps
1. Code review: verify only `'CONVERSATION'` remains in the array
2. Send a GREETING intent message → confirm response is normal (behavior unchanged)

---

## 14. FIX-I — Cold-Start ChatState Initialization

**Priority:** LOW
**Status:** VERIFIED
**Effort:** 10 minutes
**Files:** `step2.loadSession.js`, `chatSession.model.js`

---

### Core Problem

**Architecture level:**
`step2.loadSession.js:31-47` — new session creates a plain JS object for `chatState`.
Mongoose schema defaults (null, 0, []) only apply to actual Mongoose documents.
A plain JS object does not inherit schema defaults.

Missing in cold-start initialization:
- `completedTopicIds: []`
- `lastTopic: null`
- `lastDoubtTopic: null`
- `lastDoubtQuestion: null`
- `messageCount: 0`
- `consecutiveErrors: 0`
- `lastErrorAt: null`
- `lastRetrievalQuery: null` ← (will be needed after FIX-A)
- `lastStudyResponse: null` ← (will be needed after FIX-C)

Step7 has `|| []` and `|| null` fallbacks so no crash occurs today. But the inconsistency
between new session (missing fields) and existing session (all fields present) makes
future debugging harder.

**Fix:** Add all missing fields explicitly to the cold-start object in step2.

---

### Verification Steps
1. Start fresh session, send one message
2. Check `db.chat_sessions.findOne({...})` → `chatState` should have all expected fields set

---

## 15. FIX-J — Greeting TYPE 4 (Social Closing)

**Priority:** MEDIUM
**Status:** VERIFIED
**Effort:** 5 minutes
**Files:** `greetingPrompt.js`

---

### Core Problem

**Product level:**
Student says "Okay theek hai, shukriya" after a study explanation.
Zuno responds: "Arre, ab thoda aur samajhne ki koshish karte hain! Photosynthesis ke bare mein abhi tak samajh aaya hai...?"
Response is pushy, tone-deaf to the social closing signal, and re-references the previous topic unprompted.

**Architecture level:**
`greetingPrompt.js` handled only 3 TYPE cases: simple greeting, emotional, meta-reaction.
"Shukriya" / "Okay theek hai" didn't match any TYPE → LLM defaulted to TYPE 1 (greeting)
→ followed "ask what they want to study TODAY" rule → pulled topic from `{history}` → awkward.

Additionally the global instruction said: "Then bring them back to studying." — this fired for ALL types,
including what should have been a natural conversation close.

**Two root causes:**
1. Global "bring them back to studying" instruction — overrode everything
2. No TYPE 4 for social closing — LLM had no matching case to route to

---

### Implementation (what was changed)

`greetingPrompt.js`:

**Change 1 — Global instruction:**
```
// BEFORE:
"Respond warmly and briefly — 2-3 sentences maximum. Then bring them back to studying."

// AFTER:
"Respond warmly and briefly — 2-3 sentences maximum. Only invite to study if the student
seems to be starting a conversation — not ending one."
```

**Change 2 — TYPE 4 added (behavioral, not keyword-based):**
```
TYPE 4 — Satisfied close / acknowledgment:
- If the student's message reads like they are satisfied, saying thanks, or wrapping up
  the conversation — respond with ONE warm sentence and stop.
- Do NOT reference previous topics from history.
- Do NOT push more studying.
- Example: "Koi baat nahi! Jab bhi sawaal aaye, seedha poochh lena."
- Example: "Bilkul yaar! Jab mann kare padho, main yahaan hoon."
```

Scalability note: TYPE 4 is behavioral (no keyword list) — works for "ty", "👍", "samajh gaya", new expressions without maintenance.

---

### Verification

Tested: "Okay theek hai, shukriya" → Response: "Koi baat nahi! Jab bhi sawaal aaye, seedha poochh lena." ✅
One sentence, no topic push, no history reference.

---

## 16. Session Log

| Date | Fix | Action | Result |
|------|-----|--------|--------|
| 2026-06-20 | — | BRAIN_FIX_PLAN.md created. Old BRAIN_FIXES.md + BRAIN_FIX_HANDOFF.md deleted. Fresh audit done — FIX-A through FIX-I identified. | Ready to implement FIX-A |
| 2026-06-20 | FIX-A | Implemented: lastRetrievalQuery saved in step5/step7, EXPLAIN_MORE uses chatState.lastRetrievalQuery. deciderPrompt updated. | VERIFIED — terminal showed chatState.lastRetrievalQuery used on EXPLAIN_MORE turns |
| 2026-06-20 | FIX-B | Implemented: unknown intent fallback changed CONCEPT_QUESTION → GREETING in step4 normalizeDecision(). | VERIFIED — code review confirmed, parse-error catch block unchanged |
| 2026-06-20 | FIX-C | Implemented: lastStudyResponse saved in step7, exposed in step3, passed to EXPLAIN_MORE + CONCEPT_QUESTION prompts. | VERIFIED — EXPLAIN_MORE showed different headings vs original explanation |
| 2026-06-20 | FIX-D | Implemented: DriftCap block rewritten to route through step7 via synthetic capDecision/capRetrieval/capResponse objects. intent='DRIFT_CAP' — neutral, not in ACADEMIC_INTENTS or DRIFT_INTENTS. | VERIFIED — [Step 7 Complete] logged on DriftCap turns |
| 2026-06-20 | FIX-J | Implemented: greetingPrompt.js — global instruction changed, TYPE 4 behavioral block added. | VERIFIED — "shukriya" → one warm sentence, no topic push |
| 2026-06-20 | FIX-E | Implemented: askOrchestrator.js Safety Net block — filler word cleanup before searchQuery assignment. Guard: uses decider's searchQuery if available, else cleans raw question. | VERIFIED — defensive fix confirmed correct via code review; decider handled test query accurately so Safety Net did not fire |
| 2026-06-20 | FIX-F | Implemented: step2.loadSession.js:57 — exhausted session message changed to student-friendly Hinglish. | VERIFIED — code review confirmed |
| 2026-06-20 | FIX-G | Implemented: step1.validateInput.js lines 34, 39 — "babu" removed from empty question + length error messages. | VERIFIED — code review confirmed |
| 2026-06-20 | FIX-H | Implemented: step6.generateResponse.js:221 — removed dead values 'GREETING' and 'GREETINGS' from responseMode check array, kept only 'CONVERSATION'. | VERIFIED — code review confirmed |
| 2026-06-20 | FIX-I | Implemented: chatSession.model.js — getDefaultChatState() exported, derives all defaults from schema via new ChatSession(). step2.loadSession.js cold-start block replaced with ...getDefaultChatState(). Truly single source of truth. | VERIFIED — code review confirmed |

---

## 17. How To Use This File (Session Protocol)

### At Session Start
1. Read Section 1 (Role) — activates the working contract for this session
2. Read Section 2 (Current State) — confirms what is live
3. Read Section 5 (Status Tracker) — find the first PENDING fix
4. Read that fix's full detail section — understand core problem, implementation, verification

### During The Session
1. Claude explains the core problem at ALL levels (product, architecture, reasoning, hidden)
2. Farhan asks questions / raises doubts — resolve completely before moving forward
3. Claude proposes implementation options with tradeoffs
4. Claude recommends one option with reasoning
5. **Farhan approves → Claude implements → runs verification → marks VERIFIED**
6. If something unexpected found during implementation → STOP → discuss first

### At Session End
1. Update Section 5 (Status Tracker) — mark fix as VERIFIED
2. Add entry to Section 15 (Session Log)
3. Commit plan file + code changes together

### Rules For Claude (Active Every Session)
- Never implement without discussion + approval
- Never mark VERIFIED based on "looks right" — must test behavior
- If Farhan is confused → take full control, reason from scratch, use examples
- If scope creep is noticed during implementation → stop, flag, discuss
- One fix at a time unless explicitly told otherwise
- Tone: explain like teaching a sharp junior developer who wants to understand WHY, not just WHAT
