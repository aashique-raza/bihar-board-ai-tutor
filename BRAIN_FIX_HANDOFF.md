# BRAIN_FIX_HANDOFF.md
# Zuno Brain Fixes — Session Handoff Document
# Created: 2026-06-15
# Purpose: Capture complete brain fix status before switching to session work.
#          Read this when resuming brain fixes after session is done.

---

## What Was Happening Before Brain Fixes Started

Every non-study interaction ("Hi!", "App slow hai", "Mujhe Chemistry padhni hai") was getting:
> "Is topic ke baare mein material available nahi hai. Curriculum index se koi topic poochho."

EXPLAIN_MORE ("Dubara samjhao") was getting the same error.
Same question asked twice returned identical response.
Unknown intents crashed into wrong pipeline path.

---

## Fixes COMPLETED and VERIFIED

### FIX-001 — tutorPrompt: Response Mode Branching ✅
**File:** `backend/src/prompts/tutorPrompt.js`
**What it fixed:** "Hi Zuno!" / meta-complaints / emotional messages were all triggering
the empty-context rule and saying "material not available". 
**How:** Added responseMode-aware branching in system prompt:
- `conversation` mode → warm Hinglish, no "material not found"
- `redirect` mode → polite scope message
- `study_tutor` mode → strict grounding rule (unchanged)
**Verified:** Greeting → warm response, complaint → redirect, study → RAG unaffected.

---

### FIX-002 — tutorPrompt: Anti-repetition rule ✅
**File:** `backend/src/prompts/tutorPrompt.js`
**What it fixed:** Same question twice → identical response copy-pasted.
**How:** Added ANTI-REPETITION RULE scoped to `study_tutor` mode only.
Previous Turn Tracker is referenced — LLM told to vary structure/angle.
**Limitation:** At temperature=0, model still tends to repeat. Temperature fix applied (see POST-001 below).
**Verified:** Rule is in prompt. Behavior improved with temp=0.3.

---

### FIX-004 — CHOOSE_COURSE tutorPrompt instruction ✅
**File:** `backend/src/prompts/tutorPrompt.js`
**What it fixed:** "Chemistry padhni hai" → "material not available".
**How:** Added CHOOSE_COURSE branch — tutor lists chapters from curriculum, invites topic selection.
**Verified:** "Chemistry padhni hai" → lists all 5 Chemistry chapters correctly.

---

### POST-001 — LLM Provider Groq → OpenAI + dev mode query bypass ✅
**Files:** `backend/.env`, query count middleware
**What:** Migrated from Groq to OpenAI GPT-4o-mini. queryCountMiddleware bypassed in dev.
**Verified:** All 7 intent types working with OpenAI.

---

### POST-002 — BUG A/B/C batch fixes ✅
**Files:** `backend/src/prompts/tutorPrompt.js`, `backend/src/prompts/deciderPrompt.js`,
           `backend/src/ask/step6.generateResponse.js`

**BUG A:** Anti-repetition rule scoped to `study_tutor` mode only.
- `conversation` and `redirect` modes: ignore rule, respond naturally to current message.

**BUG B:** Decider GREETING expanded to cover meta-reactions.
- "Galat jawab diya", "Tum kya bol rahe ho?", "Maine sirf hi bola tha" → GREETING (not OUT_OF_CONTEXT)
- KEY RULE added: if student reacts to Zuno's response → GREETING always
- OUT_OF_CONTEXT: explicit exclusion added

**BUG C:** `getFallbackSections()` added to step6.
- `redirect` mode → "Yeh topic Class 10 Science ke scope se bahar hai..."
- `conversation` mode → "Haan! Koi sawaal ho toh poochho..."
- `study_tutor` mode → "Thodi technical dikkat aayi..."
- Before this: all modes got generic technical error message.

**Temperature fix:** step6 tutor now uses `temperature: 0.3` (was 0).
- Reason: temp=0 is deterministic → same input = exact same output → anti-repetition impossible
- step4 decider stays at temp=0 (routing must be deterministic)

---

### FIX-003 — EXPLAIN_MORE: 4-file fix ✅ (Code verified, behavior has issues — see below)
**Files:**
- `backend/src/prompts/deciderPrompt.js` — searchQuery generation for EXPLAIN_MORE
- `backend/src/ask/step5.retrieveContent.js` — re-retrieval handler
- `backend/src/ask/step7.saveAndRespond.js` — lastTopic drift guard
- `backend/src/prompts/tutorPrompt.js` — pedagogical variation mandate

**What it fixed (in code):**
- EXPLAIN_MORE now re-retrieves topic content from vector store
- lastTopic is protected from LLM drift across EXPLAIN_MORE turns
- Empty context → warm "Kaunsa topic tha?" instead of "material not found"
- Tutor instructed to vary pedagogy: structure, angle, analogy

**CRITICAL ISSUES FOUND IN LIVE TESTING (not yet fixed):**
See "Remaining Issues" section below.

---

## Remaining Brain Fix Issues (to resume after session work)

### ISSUE-1 — FIX-003 has fundamental flaw: no `lastRetrievalQuery` in session ⚠️ HIGH
**Root cause:** EXPLAIN_MORE uses decider's searchQuery OR chatState.lastTopic as query.
Both are unreliable:
- Decider re-derives topic from lastTutorResponse text → picks wrong sub-topic (e.g., neutralization instead of acid-base)
- lastTopic is set by LLM memoryUpdate → may be in wrong format, wrong language, wrong sub-topic
- **The actual searchQuery that worked (e.g., "photosynthesis process chlorophyll") is never saved to session**

**Correct fix:** Add `lastRetrievalQuery` field to ChatSession state.
- step5: when CONCEPT_QUESTION retrieves successfully, include `lastRetrievalQuery: searchQuery` in return
- step7: save it to session state (add to ALLOWED_STATE_FIELDS + schema)
- step5 EXPLAIN_MORE: use `chatState.lastRetrievalQuery` as primary → `chatState.lastTopic` as fallback
- deciderPrompt: remove searchQuery generation for EXPLAIN_MORE (step5 handles it directly now)

**Files to change:** chatSession.model.js, step5.retrieveContent.js, step7.saveAndRespond.js, deciderPrompt.js

---

### ISSUE-2 — Fresh session EXPLAIN_MORE hallucination ⚠️ HIGH
**Root cause:** Fresh session → no lastRetrievalQuery, no lastTopic → 
decider sees "Dubara samjhao" → classifies EXPLAIN_MORE → 
instruction says "generate searchQuery" → decider halluccinates topic from training data.

**Fix:** After ISSUE-1 is fixed, decider no longer generates searchQuery for EXPLAIN_MORE.
step5 checks lastRetrievalQuery (null in fresh session) → falls back to lastTopic (null) → 
returns NO_RETRIEVED_CONTEXT → tutor asks "Kaunsa topic tha?" ✅

**This issue auto-resolves when ISSUE-1 is fixed.**

---

### ISSUE-3 — Previous Turn Tracker sabotage on EXPLAIN_MORE ⚠️ MEDIUM
**Root cause:** When Zuno asks clarifying question ("Kaunsa part confusing tha?"),
that response becomes the new Previous Turn Tracker.
Next turn: LLM sees tracker = short clarifying question, not original explanation.
Anti-repetition rule now allows LLM to reuse the original explanation structure.
Result: Same title/headings appear despite variation mandate.

**Fix:** Add `lastStudyResponse` as a separate session field.
- Only updated on `study_tutor` turns with actual retrieved content (not clarifying questions)
- Passed to tutorPrompt as "Last Study Explanation" — separate from "Previous Turn Tracker"
- Anti-repetition rule checks `lastStudyResponse`, not `lastTutorResponse`

**Files to change:** step7.saveAndRespond.js (save lastStudyResponse), 
step3.buildContext.js (pass it to context), tutorPrompt.js (use it for variation mandate)

---

### FIX-005 — userId never reaches DB (LOW — deferred) 
Every session saved with userId=null even for logged-in users.
See BRAIN_FIXES.md FIX-005 for complete fix description.
Depends on: Auth middleware already sets req.user — confirmed it does.
Impact: Not user-visible now. Will require data migration when "view my conversations" is built.

---

### FIX-006 — Unknown intent fallback: CONCEPT_QUESTION → GREETING (LOW)
One line change in step4.decideRetrieval.js line 45.
Depends on FIX-001 (done). Safe to implement anytime.
See BRAIN_FIXES.md FIX-006 for details.

---

## When Resuming Brain Fixes — Do In This Order

1. **ISSUE-1 first** (`lastRetrievalQuery`) — this is the foundation for ISSUE-2 and ISSUE-3
2. **ISSUE-3 second** (`lastStudyResponse`) — Previous Turn Tracker fix
3. ISSUE-2 auto-resolves with ISSUE-1
4. FIX-006 (1 line change, quick win)
5. FIX-005 (userId) — after session sidebar is fully working (userId will be properly set then)

---

## Files Currently Modified (brain fix related)

| File | Changes |
|------|---------|
| `backend/src/prompts/tutorPrompt.js` | Response mode branching, anti-repetition, CHOOSE_COURSE, EXPLAIN_MORE pedagogy |
| `backend/src/prompts/deciderPrompt.js` | GREETING expanded, OUT_OF_CONTEXT exclusion, EXPLAIN_MORE searchQuery |
| `backend/src/ask/step5.retrieveContent.js` | EXPLAIN_MORE handler with dual fallback |
| `backend/src/ask/step6.generateResponse.js` | getFallbackSections(), temperature=0.3, conversation guard |
| `backend/src/ask/step7.saveAndRespond.js` | EXPLAIN_MORE lastTopic guard |
