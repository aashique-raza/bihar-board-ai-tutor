# BRAIN_FIXES.md — Zuno Brain Fix Tracker

**Purpose:** Track all brain-layer bugs from the 2026-06-14 QA analysis.  
Each fix is verified against actual code, ordered by priority, and includes
concrete test steps.

**How to use this file:**
- Work through fixes IN ORDER — do not skip ahead
- After each fix: run the verification steps listed
- Update status: PENDING → IN_PROGRESS → FIXED → VERIFIED  
- Do not mark VERIFIED until ALL verification steps pass
- After marking VERIFIED, add to Session Log at bottom

**What is NOT here:** Low-priority tech debt and items already in PROBLEMS.md
are excluded. See PROBLEMS.md for those.

---

## Pre-Fix Verification Results

| ID | Claim | Status | Code Evidence |
|----|-------|--------|---------------|
| V1 | tutorPrompt: no conversation-mode instruction | CONFIRMED | System prompt has exactly one content-shaping rule: "If the context is empty or missing, state calmly…" (tutorPrompt.js lines 27–29). No branch for `{responseMode}` or `conversation`. `{responseMode}` is passed in the human template but never referenced in the system instructions. |
| V2 | tutorPrompt: no anti-repetition rule | CONFIRMED | `{lastTutorResponse}` is passed as "Previous Turn Tracker" in the human template (tutorPrompt.js line 85). The word "repeat" does not appear anywhere in the file. No system instruction references `lastTutorResponse` or instructs the LLM to avoid repeating it. |
| V3 | normalizeDecision defaults to CONCEPT_QUESTION | PARTIALLY CONFIRMED | Fallback IS CONCEPT_QUESTION (step4.decideRetrieval.js line 45: `const intent = VALID_INTENTS.has(decision.intent) ? decision.intent : 'CONCEPT_QUESTION'`). But the claim that this "forces needsRetrieval=true" is incorrect: line 58 sets `needsRetrieval = Boolean(decision.needsRetrieval)` — so needsRetrieval inherits the LLM's original value. The real problem: CONCEPT_QUESTION semantics are wrong for unknown conversational intents (wrong responseMode, wrong behavior). |
| V4 | curriculumSummary sent unconditionally | CONFIRMED | step3.buildContext.js line 88: `const curriculumSummary = formatStudyMapSummary(studyMap)` — always built. step6.generateResponse.js line 101: `curriculumSummary` always passed to `getResponseChain().invoke(...)`. No condition skips it. Already tracked as PRD-006 (PENDING) in PROBLEMS.md. |
| V5 | userId never reaches DB | CONFIRMED | ask.controller.js line 6: `askQuestion(req.body)` — req.user never passed. askOrchestrator.js line 48: `askQuestion(body = {})` — no userId parameter. step7.saveAndRespond.js line 168: `addChatMessages(sessionId, [...])` — third arg (userId) never passed. chatHistory.service.js line 8: `addChatMessages(sessionId, messages = [], userId = null)` — default null. All chat_history docs and chatSessions created with userId=null. |
| V6 | EXPLAIN_MORE needs step5 code fix too | CONFIRMED | step5.retrieveContent.js lines 85–94: the `if (!needsRetrieval)` short-circuit returns `NO_RETRIEVED_CONTEXT` for EXPLAIN_MORE (no EXPLAIN_MORE branch exists before it). deciderPrompt.js line 31–32 confirms `needsRetrieval=false` for EXPLAIN_MORE. BUG-004 is marked FIXED in PROBLEMS.md but has no resolution text, and the code shows no step5 change was made — the fix was prompt-only and the step5 retrieval gap remains. |
| V7 | BUG-013 severity should be HIGH not MEDIUM | HIGH (my judgment) | Reasoning: Auth was built specifically to enable account-linked persistence. The bug silently makes auth useless for its stated purpose. Every conversation since auth was added has userId=null. When "view my conversations" is built, a full data migration would be required. No visible error surfaces — students and devs cannot know this is broken. Correctness impact is deferred but architectural damage is accumulating now. |
| V8 | CHOOSE_COURSE has no useful downstream | CONFIRMED | deciderPrompt.js lines 23–24: CHOOSE_COURSE → `needsRetrieval=false, responseMode="study_tutor"`. step5 returns `NO_RETRIEVED_CONTEXT` (no CHOOSE_COURSE handler, hits `if (!needsRetrieval)` short-circuit). tutorPrompt.js has no CHOOSE_COURSE instruction. Empty-context rule fires: student saying "Mujhe Chemistry padhni hai" gets "material not available" response. |

---

## Fixes — In Priority Order

> Work through these in order. Each fix builds on the previous.

---

### FIX-001 — tutorPrompt: Add differentiated conversation-mode instruction

**Priority:** CRITICAL  
**Type:** Prompt + Code guard (hybrid)  
**Estimated effort:** 1 hour  
**Status:** VERIFIED ✅ — 2026-06-14  
**Depends on:** none — can do standalone  
**QA Report reference:** BUG-008 (no META_COMPLAINT/CONVERSATION intent), BUG-009 (empty-context rule undifferentiated)  
**PROBLEMS.md reference:** new

**What the student experiences:**  
Every non-study interaction — greeting ("Hi Zuno!"), meta-complaint ("App bahut slow hai"), emotional message ("Mujhe padhai nahi karni") — gets the same response: "Is topic ke baare mein material available nahi hai. Curriculum index se koi topic poochho." Students feel dismissed and confused. This is the most visible brain failure after first launch.

**Root cause:**
```js
// tutorPrompt.js lines 27–29 (system prompt, "Strict Grounding" section)
- Use ONLY the factual information provided in the "Retrieved study context".
  Do not invent or assume external textbook facts.
- If the context is empty or missing, state calmly in the target script
  that the active material doesn't contain this specific topic, and invite
  them to ask about items present in the curriculum summary index.
```
This rule fires for ALL turns where `retrievedContext = 'NO_RETRIEVED_CONTEXT'`. That includes every GREETING and every misrouted turn. The prompt receives `{responseMode}` in the human template but the system prompt has ZERO instruction about what to DO differently based on its value. There is no "when responseMode is 'conversation', respond like a tutor having a normal chat" rule.

**Fix description:**  
In `tutorPrompt.js`, inside the system prompt, add a new section BEFORE "Strict Grounding" that creates a responseMode-aware branch. The empty-context rule must only fire for `study_tutor` mode, not for `conversation` or `redirect` modes.

New section to add (insert after "REGULATED ANALOGY RULE", before "Strict Grounding"):

```
Response Mode Branching (read {responseMode} from the human message):

• When responseMode is "conversation":
  The student is NOT asking a study question. This is a greeting, small talk,
  emotional message, or meta-feedback about the app/session. Do NOT trigger
  the "material not found" message. Instead:
  - Respond warmly and briefly in Roman-script Hinglish (1–2 sentences max)
  - Acknowledge what they said, then gently guide them back to studying
  - Example for greeting: "Shukriya! Aaj kya padhna chahte ho? Ek concept poochho ya topic shuru karein?"
  - Example for complaint: "Samajh gaya! Chalte hain — koi sawaal poochho ya topic choose karo."
  - Keep status: "answered" and responseMode: "conversation" in your JSON output

• When responseMode is "redirect":
  The student's message is out-of-scope or abusive. Do NOT trigger "material
  not found". Instead, acknowledge politely and redirect to Class 10 Science.
  - Example: "Yeh topic Bihar Board Class 10 Science mein nahi hai. Science ka koi sawaal poochho!"

• When responseMode is "study_tutor":
  Apply the Strict Grounding rule below. Only here should empty context
  trigger the "material not available" message.
```

The "Strict Grounding" section should then be modified to prefix its rule:
```
Strict Grounding (applies ONLY when responseMode is "study_tutor"):
```

**Do NOT do this:**
- Do not add Devanagari to conversation responses — script lock rule still applies
- Do not answer science questions in conversation mode — just redirect warmly
- Do not remove the empty-context rule — it must still fire for study_tutor mode

**Verification — after fixing, test all of these:**  
1. Send `"Hi Zuno!"` → expect warm Hinglish greeting + prompt to ask something, NOT "material not available"
2. Send `"App bahut slow hai"` → expect acknowledgment + redirect, NOT "material not available"
3. Send `"Mujhe padhai nahi karni"` → expect empathetic 1-liner + encouragement, NOT "material not available"
4. Send `"Photosynthesis kya hai?"` → must still get study_tutor response with retrieved content (regression)
5. Terminal log to look for: `[Step 4] Intent: GREETING | Needs RAG: false` for case 1

**Regression — these must still work:**
- CONCEPT_QUESTION intent must still trigger RAG retrieval
- Empty-context rule must still fire for `study_tutor` mode with no retrieved content
- NEXT_STEP handler in step5 must not be affected

---

### FIX-002 — tutorPrompt: Add anti-repetition instruction

**Priority:** HIGH  
**Type:** Prompt-only  
**Estimated effort:** 30 minutes  
**Status:** VERIFIED ✅ — 2026-06-14 (batched with FIX-001 in tutorPrompt.js)  
**Depends on:** none — standalone (can batch into same tutorPrompt.js edit as FIX-001 for efficiency, but verify independently)  
**QA Report reference:** BUG-010  
**PROBLEMS.md reference:** new

**What the student experiences:**  
After receiving an explanation of "Refraction of Light", the student asks the same question again or says "Ek baar aur batao." Zuno gives the identical response — same title, same section headings, same content. The student gets zero additional help.

**Root cause:**
```
// tutorPrompt.js — human template lines 83–85
Previous Turn Tracker:
{lastTutorResponse}
```
`lastTutorResponse` is injected into the prompt and the LLM receives it. But the system prompt has **no instruction** about what to do with it. There is no "do not repeat" rule, no "build on this" rule, no reference to `lastTutorResponse` in the system instructions at all. The LLM ignores it and generates the same answer structure again.

**Fix description:**  
In `tutorPrompt.js`, add an Anti-Repetition rule to the system prompt (add to "Core Identity & Strict Rhythm Guidelines" section):

```
Anti-Repetition Rule (CRITICAL):
- "Previous Turn Tracker" in the human message shows your LAST response.
  Do NOT reproduce the same title, main section headings, or primary content
  points from it in your current response.
- If the student asks the same question again: acknowledge briefly in 1 sentence
  ("Haan, same topic dekhte hain — alag angle se samjhata hoon"), then explain
  from a different angle, add a new example, or simplify further.
- If the student asks a genuinely new question: build on prior context naturally
  rather than starting from scratch as if nothing was said before.
- If Previous Turn Tracker is empty ("" or "N/A"): this rule does not apply.
```

**Do NOT do this:**
- Do not force the LLM to artificially make every response different even on new questions
- Do not remove `{lastTutorResponse}` from the human template

**Verification — after fixing, test all of these:**  
1. Ask `"Photosynthesis kya hai?"` → receive answer A (note the section headings)
2. Ask `"Photosynthesis kya hai?"` again → response B must have DIFFERENT headings/main points from A
3. Response B should open with an acknowledgment phrase ("Dobara dekh lete hain...")
4. Ask `"Mitochondria kya hai?"` after → must get fresh answer (not forced to differ from photosynthesis answer)
5. Terminal log: no specific log needed — verify behavior by reading response JSON `sections[].heading` values

**Regression — these must still work:**
- Different questions on different topics must still get complete, grounded answers
- `lastTutorResponse` must remain in the human template (needed for context)

---

### FIX-003 — EXPLAIN_MORE: step5 must re-retrieve lastTopic content

**Priority:** HIGH  
**Type:** Code + Prompt (4 files)  
**Estimated effort:** 2–3 hours  
**Status:** VERIFIED ✅ — 2026-06-15  
**Depends on:** none — BUG-001 is FIXED (lastTopic is persisted in chatState), so `chatState.lastTopic` is available  
**QA Report reference:** BUG-016  
**PROBLEMS.md reference:** BUG-004 (marked FIXED, but the step5 gap was not resolved — see note below)

> **Note on BUG-004:** PROBLEMS.md marks BUG-004 as FIXED but provides no resolution text. Reading the actual code shows step5.retrieveContent.js has NO EXPLAIN_MORE handler — the `if (!needsRetrieval)` short-circuit at line 86 still fires for EXPLAIN_MORE, returning NO_RETRIEVED_CONTEXT. The prior fix was likely prompt-only (telling the tutor to use lastTutorResponse). That violates the core product rule: the tutor cannot ground a re-explanation in retrieved content if step5 never retrieves it. FIX-003 completes what BUG-004's fix left unfinished.

**What the student experiences:**  
After Zuno explains Refraction of Light, the student says "Nahi samajh aaya, dubara samjhao." Zuno responds: "Is topic ke baare mein material available nahi hai." The most natural learning interaction — asking for re-explanation — fails with a "not found" error. This is also a core product rule violation: the tutor answers from general knowledge (or refuses) instead of grounded content.

**Root cause:**
```js
// step5.retrieveContent.js lines 85–94
// Short-circuit routing check
if (!needsRetrieval) {
  console.log('[Step 5 Bypassed] Skipping vector database lookups due to conversational context routing rule.');
  return {
    retrieval: null,
    chunks: [],
    sources: [],
    retrievedContext: 'NO_RETRIEVED_CONTEXT',
  };
}
```
`deciderPrompt.js` (line 31–32) routes EXPLAIN_MORE with `needsRetrieval=false`. Step5 hits the short-circuit at line 86 and returns `NO_RETRIEVED_CONTEXT`. There is no EXPLAIN_MORE handler before the short-circuit. Even if the tutorPrompt instructs the LLM to "re-explain using lastTutorResponse", the LLM receives no grounded retrieved content — core product rule violation.

**Fix description:**  
In `step5.retrieveContent.js`, add an EXPLAIN_MORE handler AFTER the NEXT_STEP block (line 83) and BEFORE the `if (!needsRetrieval)` short-circuit (line 86). The pattern mirrors the existing NEXT_STEP handler:

```js
// step5.retrieveContent.js — add after line 83, before line 86:
if (intent === 'EXPLAIN_MORE') {
  const topicQuery = chatState?.lastTopic;

  if (!topicQuery) {
    // No lastTopic — cannot re-retrieve. Return empty context so tutor
    // can gracefully ask the student what they want re-explained.
    console.log('[Step 5 EXPLAIN_MORE] No lastTopic found — returning empty context.');
    return { retrieval: null, chunks: [], sources: [], retrievedContext: 'NO_RETRIEVED_CONTEXT' };
  }

  console.log(`[Step 5 EXPLAIN_MORE] Re-retrieving content for lastTopic: "${topicQuery}"`);
  const explainRetrieval = await retrieveRelevantChunks(topicQuery, getRetrieverOptions(focusChapter));
  const explainChunks = explainRetrieval.results || [];

  return {
    retrieval: explainRetrieval,
    chunks: explainChunks,
    sources: formatSources(explainChunks),
    retrievedContext: formatRetrievedContext(explainChunks),
  };
}
```

No changes needed to deciderPrompt.js — `needsRetrieval=false` for EXPLAIN_MORE is correct (the intent is handled specially in step5, not via the generic needsRetrieval path).

**Do NOT do this:**
- Do not change `needsRetrieval` to `true` for EXPLAIN_MORE in the decider — it would skip the EXPLAIN_MORE branch and fall into generic RAG with a null searchQuery
- Do not rely on tutorPrompt alone to re-explain — that violates the core product rule

**Verification — after fixing, test all of these:**  
1. Ask `"Photosynthesis kya hai?"` → get answer (confirm lastTopic is set via session payload `session.lastTopic`)
2. Ask `"Nahi samajh aaya, dubara samjhao"` → terminal log must show: `[Step 5 EXPLAIN_MORE] Re-retrieving content for lastTopic: "Photosynthesis"` (or whatever lastTopic was set to)
3. Response must reference actual photosynthesis content from the textbook, NOT "material not available"
4. Fresh session (no prior turns): ask `"Dobara batao"` → graceful response asking what to re-explain (lastTopic is null → NO_RETRIEVED_CONTEXT path), NOT a crash
5. Terminal log pattern to verify: `[Step 5 EXPLAIN_MORE] Re-retrieving` or `[Step 5 EXPLAIN_MORE] No lastTopic`

**Regression — these must still work:**
- CONCEPT_QUESTION → `needsRetrieval=true` path (generic RAG) must be unaffected
- NEXT_STEP handler must still run before the EXPLAIN_MORE handler (no change to line order needed)
- `chatState.lastTopic` being null must not crash step5 (null guard in fix above handles this)

---

### FIX-004 — CHOOSE_COURSE: Add tutorPrompt instruction for subject selection turns

**Priority:** HIGH  
**Type:** Prompt-only + step6 intent pass (1 line)  
**Estimated effort:** 1 hour  
**Status:** VERIFIED ✅ — 2026-06-14 (batched with FIX-001; step6 now passes intent in decision field)  
**Depends on:** none — standalone  
**QA Report reference:** BUG-014  
**PROBLEMS.md reference:** new

**What the student experiences:**  
A student opens Zuno and says "Mujhe aaj Chemistry padhni hai" or "Biology shuru karo." This is the most natural first message. Zuno responds: "Is topic ke baare mein material available nahi hai. Curriculum index se koi topic poochho." The student's subject selection is completely ignored and they get a confusing error message.

**Root cause:**
```
// deciderPrompt.js lines 22–24
3. "CHOOSE_COURSE":
   - Criteria: Explicit intent to initialize or switch to a different subject...
   - Routing: needsRetrieval=false, responseMode="study_tutor"
```
```js
// step5.retrieveContent.js lines 85–94
if (!needsRetrieval) { return { retrievedContext: 'NO_RETRIEVED_CONTEXT' }; }
```
```
// tutorPrompt.js lines 27–29 (only content rule for study_tutor mode with empty context)
- If the context is empty or missing, state calmly that the active material
  doesn't contain this specific topic…
```
CHOOSE_COURSE → `needsRetrieval=false` → step5 returns `NO_RETRIEVED_CONTEXT` → tutorPrompt has no CHOOSE_COURSE instruction → empty-context rule fires → "content not found" response.

**Fix description:**  
In `tutorPrompt.js`, add a CHOOSE_COURSE handling instruction to the Response Mode Branching section added by FIX-001 (or as a standalone "Special Intent Rules" section if FIX-001 is batched separately):

```
CHOOSE_COURSE Response Rule:
When the Decider Routing Matrix shows intent "CHOOSE_COURSE" (responseMode will be "study_tutor"):
- The student has expressed which subject they want to study. This is a course
  selection moment, NOT a content retrieval request — do NOT trigger the
  "material not available" message.
- Respond warmly, confirm their choice, and list available chapters from the
  "Full Textbook Curriculum Index" (use only chapters listed there — do not invent any).
- End with an invitation: ask if they want to start from the first chapter or
  jump to a specific topic.
- Example: "Chemistry mein padhte hain aaj! Humare paas yeh chapters hain:
  [list from curriculum]. Kahan se shuru karein — Chapter 1 se, ya koi specific topic?"
- Set status: "answered", responseMode: "study_tutor" in JSON output.
```

**Do NOT do this:**
- Do not invent chapter names — the LLM must use only what is in `{curriculumSummary}`
- Do not trigger RAG retrieval for CHOOSE_COURSE — this fix is prompt-only

**Verification — after fixing, test all of these:**  
1. `"Mujhe aaj Chemistry padhni hai"` → response must list Chemistry chapters by name (from curriculum), NOT "content not found"
2. `"Biology shuru karo"` → response must name Biology chapters and invite topic selection
3. `"Physics me electric current padhna hai"` → this is a CONCEPT_QUESTION, not CHOOSE_COURSE — must NOT trigger the CHOOSE_COURSE response, must trigger RAG (regression check)
4. Terminal log: `[Step 4] Intent: CHOOSE_COURSE | Needs RAG: false` for cases 1 and 2

**Regression — these must still work:**
- `"Photosynthesis kya hai?"` → CONCEPT_QUESTION with retrieval, unaffected
- Empty-context rule must still fire for `study_tutor` + truly unknown topics

---

### FIX-005 — Wire userId from JWT auth middleware to DB

**Priority:** HIGH  
**Type:** Code-only (3 files)  
**Estimated effort:** 2–3 hours  
**Status:** PENDING  
**Depends on:** none — standalone (assumes JWT auth middleware already exists and sets `req.user`)  
**QA Report reference:** BUG-013  
**PROBLEMS.md reference:** new

**What the student experiences:**  
Not visible today. But silently, every conversation is saved with `userId = null` in MongoDB — even for logged-in users. The auth system is completely bypassed. When "view my conversations" is built, all existing data will be orphaned (not linked to any user) and will require a full data migration.

**Root cause — trace the full path:**
```js
// ask.controller.js line 6
const answerPayload = await askQuestion(req.body);
// req.user is available here (set by JWT middleware) but is NEVER passed.
// req.user?.userId is dropped silently.
```
```js
// askOrchestrator.js line 48
export const askQuestion = async (body = {}) => {
// Function signature has no userId parameter. Cannot receive it even if
// the controller passed it.
```
```js
// step7.saveAndRespond.js line 168
await addChatMessages(sessionId, [...messages]);
// addChatMessages accepts (sessionId, messages, userId=null).
// userId is never passed — always saves null.
```
```js
// chatHistory.service.js line 8
export const addChatMessages = async (sessionId, messages = [], userId = null) => {
  // ...
  $setOnInsert: { userId },  // userId is null every time — saves null to MongoDB
```

**Fix description — three targeted changes:**

**Change 1 — `ask.controller.js`:**
```js
export const askQuestionController = async (req, res, next) => {
  try {
    const userId = req.user?.userId || null; // Extract from JWT middleware
    const answerPayload = await askQuestion(req.body, { userId });
    // ...
  }
};
```

**Change 2 — `askOrchestrator.js`:**
```js
export const askQuestion = async (body = {}, { userId = null } = {}) => {
  // ... pre-pipeline steps unchanged ...
  
  // In main pipeline, pass userId through to step7:
  return saveAndRespond(input, session, context, decision, retrieval, response, userId);
};
```

**Change 3 — `step7.saveAndRespond.js`:**
```js
export const saveAndRespond = async (
  { question, studyMode, focusChapter },
  { sessionId, chatState },
  { language },
  decision,
  { retrieval, sources, nextTopicSignal },
  response,
  userId = null   // NEW parameter
) => {
  // ...
  await addChatMessages(sessionId, [...messages], userId); // Pass userId here
  
  // Also set userId on the session itself (for first-save via upsert):
  if (userId) {
    stateUpdates.userId = userId; // or use a separate updateChatSession call
  }
};
```

Note: `updateChatSessionState` updates the `chatState` subdocument. Setting `userId` (a top-level field on the session) may need a separate call or a modification to `updateChatSessionState` to accept top-level field overrides. Investigate the `chatSession.service.js` update logic before implementing.

**Do NOT do this:**
- Do not break guest session flow — `userId = null` must still be a valid state for guests
- Do not assume `req.user` always exists — optional chaining (`?.`) is required

**Verification — after fixing, test all of these:**  
1. Log in with a user account, send any question via the app
2. In MongoDB Atlas: `db.chat_histories.findOne({ sessionId: "..." })` → `userId` field must NOT be null
3. `db.chat_sessions.findOne({ sessionId: "..." })` → `userId` field must match the logged-in user's ID
4. As guest (no login), send a question → both collections must still have `userId: null` (guest flow unchanged)
5. Terminal log: no specific log needed — verify via DB inspection

**Regression — these must still work:**
- Guest sessions (userId=null) must continue to work without errors
- All 7 ask pipeline steps must return normal responses — this change only adds a new parameter flow
- `addChatMessages` with `userId=null` must still work (guest case)

---

### FIX-006 — normalizeDecision: Change unknown-intent fallback from CONCEPT_QUESTION to GREETING

**Priority:** MEDIUM  
**Type:** Code-only (1 line in step4.decideRetrieval.js)  
**Estimated effort:** 30 minutes  
**Status:** PENDING  
**Depends on:** FIX-001 — the GREETING fallback produces a safe conversational response ONLY after FIX-001 adds conversation-mode instruction to tutorPrompt. Without FIX-001, GREETING→conversation→NO_RETRIEVED_CONTEXT still triggers the empty-context rule.  
**QA Report reference:** BUG-012  
**PROBLEMS.md reference:** new

**What the student experiences:**  
Not directly visible under normal use. But if the decider LLM hallucinates an intent not in the 7-item taxonomy (e.g., "META_COMPLAINT", "REVIEW", "FEEDBACK"), the pipeline routes it as CONCEPT_QUESTION — which uses `study_tutor` mode and may trigger RAG with a poor query. Result: either an unnecessary vector search or a "content not found" error for a non-study message.

**Root cause:**
```js
// step4.decideRetrieval.js line 45
const intent = VALID_INTENTS.has(decision.intent) ? decision.intent : 'CONCEPT_QUESTION';
```
`CONCEPT_QUESTION` is the worst possible fallback for unknown intents because:
1. Its semantics imply an academic study question
2. If `decision.needsRetrieval` was true, it triggers RAG on a non-study message
3. It sets `responseMode = 'study_tutor'` (or keeps LLM's value), which causes the empty-context rule to fire if RAG returns nothing

**Fix description:**  
Change line 45 of `step4.decideRetrieval.js`:
```js
// BEFORE:
const intent = VALID_INTENTS.has(decision.intent) ? decision.intent : 'CONCEPT_QUESTION';

// AFTER:
const intent = VALID_INTENTS.has(decision.intent) ? decision.intent : 'GREETING';
if (!VALID_INTENTS.has(decision.intent)) {
  console.warn(`[Step 4] Unknown intent "${decision.intent}" — falling back to GREETING`);
}
```

Why GREETING is a better fallback:
- GREETING → `responseMode='conversation'` (line 51, since 'conversation' is in VALID_RESPONSE_MODES and it's the LLM's natural choice for unknown intents) — actually the LLM's responseMode value is used if valid, so this depends on what the LLM returns. More precisely: the fallback makes the `inScope` check true (GREETING is in scope), and `needsRetrieval=false` (line 58: only true for CONCEPT_QUESTION), so no RAG is triggered. FIX-001's conversation-mode instruction then produces a sensible warm response.
- CONCEPT_QUESTION is wrong semantically — a student making a meta-complaint is not asking a study question.

**Do NOT do this:**
- Do not change the parse-error fallback in the `catch` block (line 130–138) — that uses CONCEPT_QUESTION with `needsRetrieval: false` which is a safe explicit override
- Do not implement FIX-006 before FIX-001 is done and verified

**Verification — after fixing, test all of these:**  
1. This is hard to test directly (requires the LLM to return an unknown intent). Test via code review: confirm line 45 is changed and the warn log is present.
2. Send all 7 known intent types and confirm routing is unchanged (regression sweep)
3. Watch for the `[Step 4] Unknown intent` warn log in prod — if it appears, it means the decider is hallucinating — investigate prompt quality
4. Terminal log to look for when unknown intent occurs: `[Step 4] Unknown intent "META_COMPLAINT" — falling back to GREETING`

**Regression — these must still work:**
- All 7 valid intents (UNSAFE_OR_ABUSIVE, GREETING, CHOOSE_COURSE, NEXT_STEP, EXPLAIN_MORE, CONCEPT_QUESTION, OUT_OF_CONTEXT) must be unaffected
- parse-error catch block fallback (line 130–138) is unchanged — must still return safe default

---

## Fix Dependency Map

```
FIX-001: tutorPrompt conversation-mode instruction — STANDALONE
  (Must be done first — FIX-006 depends on it)

FIX-002: tutorPrompt anti-repetition guard — STANDALONE
  (Can batch into same tutorPrompt.js edit as FIX-001; verify independently)

FIX-003: EXPLAIN_MORE step5 re-retrieval — STANDALONE
  (BUG-001 already fixed, lastTopic is available in chatState)

FIX-004: CHOOSE_COURSE tutorPrompt instruction — STANDALONE
  (Can batch into same tutorPrompt.js edit as FIX-001; verify independently)

FIX-005: userId wiring — STANDALONE
  (Requires auth middleware to already set req.user — confirm before starting)

FIX-006: normalizeDecision GREETING fallback — DEPENDS ON FIX-001
  (Reason: GREETING fallback routes to conversation mode; without FIX-001's 
  conversation instruction, tutorPrompt still fires the empty-context rule 
  for any message in conversation mode with NO_RETRIEVED_CONTEXT)
```

Batching note: FIX-001, FIX-002, and FIX-004 all touch `tutorPrompt.js`. They can be applied in a single edit for efficiency, but each must be verified independently using its own test steps before marking VERIFIED.

---

## Excluded Items

### Already tracked in PROBLEMS.md — not duplicated here:
- **PRD-006** — curriculumSummary sent unconditionally on all turns (wasted tokens) — PENDING  
  *(BUG-011 from QA report maps to this exactly. See PROBLEMS.md PRD-006 for fix details.)*

### Already fixed in PROBLEMS.md — do not re-do:
- **BUG-001** — lastTopic/lastDoubtTopic/lastDoubtQuestion fields not persisted — FIXED 2026-06-06  
  *(FIX-003 depends on this being fixed and assumes chatState.lastTopic is now persisted)*
- **BUG-002** — No try/catch in step4 — FIXED 2026-06-06
- **BUG-005** — English input → English output — FIXED 2026-06-06
- **BUG-006** — NEXT_STEP no downstream logic — FIXED 2026-06-07
- **BUG-007** — completedTopicIds not in schema/allowlist — FIXED 2026-06-07
- **STB-001** — No frontend fetch timeout — FIXED 2026-06-07

### Deferred — LOW priority / not brain-critical:

- **BUG-015: Guest → logged-in query limit carryover gap**  
  Not observed in code during this audit (would require auth rate-limiting code to exist). LOW — no immediate user impact; defer until rate limiting (STB-003) is implemented.

- **BUG-017: Devanagari guard in step4 silently drops valid retrieval**  
  CONFIRMED: step4.decideRetrieval.js lines 62–74 — if LLM returns Devanagari searchQuery, it is set to null and retrieval is skipped with a console.warn. This is an intentional safety measure from the BUG-005 fix. It can produce false negatives if the LLM ignores the "translate to English" instruction. LOW — the deciderPrompt already instructs English/Roman-script only. Severity does not justify immediate fix.

- **BUG-018: Reranker WEAK_QUERY_TERMS includes 'human' and 'humans'**  
  CONFIRMED: reranker.js line 20: `'human', 'humans', 'beings'` are in WEAK_QUERY_TERMS. This would suppress the 'human' keyword boost for queries like "human digestive system" or "human heart". LOW — Biology chapters still surface via embedding similarity; keyword boost is additive. Fix: remove 'human', 'humans', 'beings' from WEAK_QUERY_TERMS when reranker tuning is scheduled.

- **BUG-019: applyDiversityPenalty may suppress relevant chunks silently**  
  CONFIRMED: reranker.js lines 207–222 — `applyDiversityPenalty()` penalizes the 3rd+ chunk from the same parent heading by 0.035. No log is emitted when penalty fires. LOW — penalty is small (0.035) and only affects 3rd+ chunks from the same parent. Add a debug log line inside the `if (currentCount >= 2)` branch when investigating retrieval quality issues.

- **BUG-020: step6 intent firewall dead code — 'GREETING' and 'GREETINGS' checks never fire**  
  CONFIRMED: step6.generateResponse.js lines 117–119:
  ```js
  const normalizedIntent = String(responseMode || '').toUpperCase();
  if (['GREETING', 'CONVERSATION', 'GREETINGS'].includes(normalizedIntent)) {
  ```
  `responseMode` values are: 'conversation', 'study_tutor', 'redirect'. Only 'CONVERSATION' can match. 'GREETING' and 'GREETINGS' are intent values, not responseMode values — they will never appear here. The 'CONVERSATION' check works correctly. LOW — dead code, no functional impact. Cleanup: remove 'GREETING' and 'GREETINGS' from the array, rename `normalizedIntent` to `normalizedResponseMode`.

---

## Available Test Commands

Scripts found in `backend/scripts/`:
- `validate-vector-store.js`
- `test-rag-answer.js`
- `test-study-map.js`
- `test-mongo-connection.js`
- `test-chat-db-models.js`
- `qa-flow-test.js`
- `build-curriculum-index.js`
- `test-curriculum-resolvers.js`
- `test-langchain-embedding-smoke.js`
- `test-retriever.js`
- `test-ask-db-integration.js`
- `test-next-topic-resolver.js`
- `test-vector-store-load-search.js`

After each fix, run these relevant checks from `backend/`:
```bash
# Fast checks — run after every fix (no network required)
npm run test:chunks              # RAG chunker — 17/17 expected
npm run test:study-map           # 16 chapters expected
npm run test:curriculum-resolvers

# Slower checks — run after FIX-003 or FIX-005 (require API keys + network)
npm run test:retrieval           # Live retrieval smoke test (needs Gemini key)
npm run test:ask-db              # Live ask + DB integration (needs all keys + network)
npm run db:ping                  # Test MongoDB Atlas connection

# Vector store integrity
npm run test:vector-store        # 600 vectors, 3072-dim expected

# RAG retriever
npm run rag:test-retriever       # 7 queries, needs Gemini key
```

Note: Full end-to-end brain test (actual LLM calls) requires manual testing via the running app. The verification steps in each fix describe exactly what to test manually. Type checking and automated tests verify code correctness — manual chat testing verifies brain behavior.

---

## Session Log

| Date | Fix ID | Action | Result |
|------|--------|--------|--------|
| 2026-06-14 | — | BRAIN_FIXES.md created | 8 claims verified, 6 active fixes, 5 deferred |
| 2026-06-14 | FIX-001 | Hybrid fix: tutorPrompt Response Mode Branching + step6 code guard | VERIFIED — "Hi Zuno!" → warm Hinglish, emotional → empathetic, study → RAG unaffected |
| 2026-06-14 | FIX-002 | Anti-repetition rule added to tutorPrompt Core Identity section | VERIFIED — batched with FIX-001 |
| 2026-06-14 | FIX-004 | CHOOSE_COURSE tutorPrompt rule + step6 intent pass in decision field | VERIFIED — "Chemistry padhni hai" → lists all 5 Chemistry chapters correctly |
| 2026-06-14 | POST-001 | LLM provider migrated Groq → OpenAI GPT-4o mini. queryCountMiddleware bypassed in dev mode. | VERIFIED — all 7 intent types working with OpenAI |
| 2026-06-14 | POST-002 | BUG A: Anti-repetition rule scoped to study_tutor mode only (tutorPrompt.js). BUG B: Decider GREETING expanded to cover meta-conversation messages + OUT_OF_CONTEXT explicit exclusion (deciderPrompt.js). BUG C: getFallbackSections() added to step6 — redirect/out_of_scope/conversation each get appropriate fallback text instead of generic technical error. | VERIFIED ✅ — 2026-06-15. Temperature fix also applied: step6 tutor now uses temperature=0.3 (was 0) for pedagogical variation. |
| 2026-06-15 | FIX-003 | EXPLAIN_MORE: 4-file fix. (1) deciderPrompt: searchQuery generated from lastTutorResponse context for EXPLAIN_MORE. (2) step5: EXPLAIN_MORE handler re-retrieves via decider.searchQuery → chatState.lastTopic fallback, focusChapter excluded. (3) step7: lastTopic/lastDoubtTopic guarded from LLM drift on EXPLAIN_MORE turns. (4) tutorPrompt: full pedagogical variation mandate for EXPLAIN_MORE — different structure/angle/analogy, facts grounded, empty-context asks student for topic name. | VERIFIED ✅ — 2026-06-15 |
