# Zuno Pipeline Optimization Plan — Token Blowup Root-Cause Fix

> **Predecessor:** [TOKEN_FIX_PLAN.md](TOKEN_FIX_PLAN.md) — STEP 0-6 complete. STEP 7-8 superseded by this document.
> **Created:** 2026-06-17
> **Status:** Phase 2 complete — next is Phase 3 (Session Integrity Guard)
> **Last session:** Phase 0 ✅ | Phase 1 ✅ | Layer 2.0 ✅ | Layer 2.1 ✅ | Layer 2.2 ✅ | Layer 2.3 ✅ | Layer 2.4 ✅ | Layer 2.5 ✅ | Layer 2.6 deferred (post-deployment)
> **Owner:** Farhan Raza (developer) + Claude (senior engineering advisor)

---

## 0. Read This First (Mandatory Before Any Step)

This file is the **multi-session bridge** for fixing Zuno's token blowup problem. It exists because the problem is bigger than one session can finish. You will pick this file up across many sessions, work on one small step at a time, mark it done, move on.

**Why this file exists:**
- Session context windows are limited. Without this file, the next session starts cold.
- The plan has been deeply analyzed across 4 long discussions. Re-deriving that analysis every session = wasted effort.
- Status tracking here = single source of truth on what's done vs pending.

**How to use this file in any session:**
1. Read sections 1-4 (Context, Architecture Decision, Blind Spots, Status Tracker) to refresh.
2. Look at the Status Tracker (section 5) to find the next incomplete small step.
3. Open that step's section, read the full detail.
4. Discuss with senior engineer (Claude) — clarify doubts, edge cases, etc.
5. Implement that ONE small step. Test. Mark done in Status Tracker.
6. Stop. Next session continues from the next step.

**Full session protocol is in Section 14 at the bottom.**

---

## 1. Context Recap — What Problem We're Solving

### The symptom (what the user sees)
- Student sends 3-4 messages, session locks out with "token limit reached"
- Even if we raise the limit to 100k, only 10-12 turns fit
- Goal: ~30 quality learning turns per session at a reasonable token budget

### Root cause (discovered across 4 deep-dive sessions)
The Ask pipeline (`backend/src/ask/`) has **5 categories of token waste**:

1. **Static prompt bloat** — Decider system prompt is ~900 tokens; Tutor is ~1700 tokens. Sent **every turn**.
2. **Per-turn input bloat** — Duplicate fields (`lastTutorResponse` duplicates history content), dead-weight inputs (decider receives `focusChapter` JSON it doesn't use), bloated formats (pretty-printed JSON, redundant chunk IDs).
3. **Architectural** — One monolithic tutor prompt handles 6 different intents (greeting, redirect, choose_course, explain_more, concept_question, next_step). Every turn pays for ALL intents' rules even when only one applies.
4. **Measurement blindness** — Current logger shows dynamic context tokens but hides static system prompt cost (~2,600 tokens/turn). Without visibility, fixes can't be verified.
5. **History compounding** — History grows ~200 tokens/turn. By turn 10, history alone is 60% of per-turn budget.

### What was already tried (TOKEN_FIX_PLAN.md, steps 0-6)
- ✅ STEP 0: Token logging instrumentation
- ✅ STEP 1: Removed `lastTutorResponse` from **decider** (still duplicate in tutor — this plan fixes that)
- ✅ STEP 2: Fixed RAG chunk double-wrapping ([Context] header strip)
- ✅ STEP 3: Compacted memory JSON + completedTopicIds → count
- ✅ STEP 4: Decider history window reduced 14 → 6 messages
- ✅ STEP 5: Conditional curriculumSummary
- ✅ STEP 6: Set maxTokens on LLM calls

**Outcome:** Marginal improvement only. Per-turn still ~7,500 tokens. **Three turns still hit 15k window.**

**Why marginal:** Steps 0-6 trimmed leaves while leaving the root architectural problem (monolithic prompt) untouched.

### The user's key insight (which validates this plan)
The user (Farhan) raised this as a senior product-engineering observation:
> *"Decider sirf intent classify karta hai — usko curriculum/RAG/etc. nahi chahiye. Aur tutor — agar intent conversation hai, to RAG/curriculum/chapter content kyun de rahe hain? Sirf query + prompt + history kafi hai."*

This intuition is architecturally correct. **Intent-specific dispatch** is the answer.

---

## 2. The Architecture Decision

### What we're building (one paragraph)
A 3-layer optimization on top of the existing 7-step Ask pipeline: **(a) instrument first** so we can verify impact, **(b) trim safe wins** with low-risk changes, **(c) refactor tutor into intent-specific specialized prompts** with code-side safety guards to prevent hallucination on misclassified intents. Optional layers for caching and history compression sit on top, gated by measured results.

### Why this approach (and not alternatives)
We explicitly rejected:
- **Solution 1 alone (Smart Trim)** — Hits a ceiling. Won't reach target. Same trap as STEP 0-6.
- **Pure rule-based intent classifier** — Already rejected in TOKEN_FIX_PLAN.md ("kills intelligence in Hinglish nuance"). Confirmed.
- **Merge decider + tutor into one LLM call** — Circular dependency: tutor needs retrieved chunks, retrieval needs decider's searchQuery.
- **Conversation summarization (3rd LLM call)** — Adds latency, race conditions, cost. Rejected in TOKEN_FIX_PLAN.md.
- **Switching LLM provider just for caching** — Premature optimization. Decide after measuring.

We chose the **layered hybrid** because:
- Each phase is independently shippable
- Each phase has measurable impact
- Risks are amortized across phases (not big-bang)
- Future-proof: new intents = new prompts, isolated additions
- Defense layers protect against architectural-level failure modes (see Section 3)

### Token budget targets (realistic, with proper measurement)

| Phase complete | Per-turn avg | Turns @ 30k window | Notes |
|----------------|--------------|---------------------|-------|
| Today | ~5,500 | ~5 turns | After STEP 0-6 |
| Phase 0 | ~5,500 | ~5 turns | Pure visibility, no behavior change |
| Phase 1 | ~4,000 | ~7-8 turns | Safe trims, no architecture change |
| Phase 2 | ~2,500-3,000 | ~10-12 turns | **Target hit** |
| Phase 3 (Session Integrity) | ~2,500-3,000 | ~10-12 turns (but 2-5 fewer wasted turns) | Protects budget from drift exploitation |
| Phase 4 (if Groq supports caching) | ~1,800-2,200 | ~14-16 turns | Bonus, not promised |
| Phase 5 (conditional) | ~1,500-1,800 | ~17-20 turns | Only if Phase 2+3 misses target |

### What "future-proof" means in this plan
- Adding a new intent (e.g., QUIZ, EXAM_MODE) = create new prompt file + register in intent handler map. No core pipeline changes.
- Swapping LLM provider per intent = change one config entry. No prompt rewrites.
- A/B testing prompt variations = swap one handler. No system-wide impact.

---

## 3. The 5 Blind Spots (Defense Layers Required)

These are the failure modes that surfaced when we stress-tested the proposed architecture. **They are non-negotiable.** Skipping any one of these = product failure risk.

### Blind Spot 1: Wrong-intent classification → Hallucination
**Risk:** Decider misclassifies "Pranam sir, photosynthesis ke baare mein batao" as GREETING. Greeting prompt has no RAG context. LLM answers from general knowledge. **Violates core product rule** ("answer only from indexed content").

**Defense:**
- **Layer 1**: Decider system prompt has explicit conservative bias rule: "if message has BOTH greeting AND academic keyword, prefer CONCEPT_QUESTION"
- **Layer 2**: Code-side override in `step5` dispatcher — academic keyword regex check; if mismatch with intent, promote to CONCEPT_QUESTION
- **Layer 3**: Each intent prompt has anti-hallucination guard: "if user mentions academic topic but mode is conversation, redirect to study mode"
- **Layer 4**: Production logging when override fires. If > 5% of turns trigger override, decider needs retraining.

### Blind Spot 2: Existing code has hidden quality guards
**Risk:** Current `step6.generateResponse.js` has 3 guards built over time:
- Conversation mode safety override (line 165-176) — catches LLM returning wrong status
- Title rescue (line 184-187) — promotes title to section content when LLM ignores schema
- Status normalization (line 192-203) — forces correct status by intent

**Defense:** When migrating to intent-specific prompts, **port ALL guards to per-intent logic**. Do NOT remove them assuming "intent router will never confuse modes."

### Blind Spot 3: History compounds linearly — intent router doesn't fix it
**Risk:** Turn 10 has ~2,000-token history. Intent router saves ~3,000 tokens elsewhere but history still dominates. We projected "13-15 turns" — actual could be ~10.

**Defense:**
- **Per-intent history windowing** — GREETING gets last 4 msgs, REDIRECT gets 0, CONCEPT gets last 6, NEXT_STEP gets last 2. Defined in intent handler config.
- **Phase 4 (conditional)** — if per-intent windowing isn't enough, switch to compressed history representation (tutor messages replaced with `[Zuno explained X]` placeholders for old turns).

### Blind Spot 4: Caching is uncertain — don't bet on it
**Risk:** Earlier proposal counted on Groq prompt caching. Groq's caching availability for `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` is unverified as of 2026-06-17.

**Defense:**
- Phase 3 is a **probe**, not a commitment. Test if `cache_read_input_tokens` appears in API response. If yes, enable. If no, abandon.
- **No provider switch** purely for caching. Provider switches are separate decisions with their own cost/benefit analysis.

### Blind Spot 5: Subtle bugs uncovered in code review
**Bug A** — `tokenUsage` not counted on provider-error failures (step7 never reached). Latent under-counting.
**Bug B** — Empty history string is "No previous messages in this session." (~10 tokens). Should be empty string with conditional template.
**Bug C** — `INACTIVITY_THRESHOLD_MS` (step2:59-63) resets `learningMode` to idle but preserves `currentChapterId`. Inconsistent state.
**Bug D** — Decider doesn't receive language hint. Devanagari classification accuracy on 8B model could suffer.

**Defense:** Address each in appropriate phase (Phase 1 catches Bugs B, D; Phase 2 addresses A).

---

## 4. Critical Rules (Hard Stops)

These are non-negotiable. **Do not skip or shortcut these.**

| Rule | Why | When enforced |
|------|-----|---------------|
| Phase 0 (logger) MUST complete before Phase 1 | Without static prompt visibility, impact verification impossible | Always |
| Defense Layer 2 (code-side intent override) MUST be in Phase 2 | Otherwise decider errors = hallucination = product rule violation | Phase 2 |
| Feature flag MUST exist for Phase 2 | Big-bang switch is reckless; need toggleable rollback | Phase 2 |
| Test set of 30-50 queries with expected intents BEFORE Phase 2 | Without baseline, can't validate intent accuracy | Phase 2 prep |
| Monolithic `tutorPrompt.js` MUST stay alive 2 weeks post-Phase-2 | Production safety insurance | Phase 2 cleanup |
| Caching is NOT promised in projections | Provider feature, may not work | Phase 3 |
| One small step at a time. Test. Mark done. Then next. | Multi-session safety | Always |
| Never touch RAG reranker without separate discussion | Quality regression risk, out of scope | Always |
| Never touch tutor prompt persona/tone without separate discussion | Subtle, hard-won quality | Always |

---

## 5. Status Tracker (Single Source of Truth)

Update this section as steps complete. Use `[ ]` for pending, `[~]` for in-progress, `[x]` for done, `[!]` for blocked.

### Phase 0 — Instrumentation Upgrade
- [x] Layer 0.1 — Static prompt token counter
  - [x] Step 0.1.1 — Add `estimateSystemPromptTokens()` helper to tokenLogger
  - [x] Step 0.1.2 — Wire static count into `logCallTokens` output
- [x] Layer 0.2 — Per-intent token tracker
  - [x] Step 0.2.1 — Tag turn summary with intent label
  - [x] Step 0.2.2 — Add per-intent aggregate counter (in-memory, last 100 turns)
- [x] Layer 0.3 — Cache hit detector (for Phase 3 readiness)
  - [x] Step 0.3.1 — Provider-agnostic cache field detector in `extractTokenBreakdown`
  - [x] Step 0.3.2 — Track cache savings in per-intent aggregates

### Phase 1 — Safe Wins (No Architecture Change)
- [x] Layer 1.1 — Tutor input bloat fixes
  - [x] Step 1.1.1 — Remove `lastTutorResponse` duplicate from tutor invoke
  - [x] Step 1.1.2 — Remove `decision` JSON pretty-print bloat
  - [x] Step 1.1.3 — Convert `focusChapter` JSON → compact string
- [x] Layer 1.2 — Decider input bloat fixes
  - [x] Step 1.2.1 — Remove `currentStudyContext` from decider invoke
  - [x] Step 1.2.2 — Remove `focusChapter` from decider invoke
  - [x] Step 1.2.3 — Add language hint to decider input (Bug D fix)
- [x] Layer 1.3 — RAG context trimming
  - [x] Step 1.3.1 — Remove `Chunk ID` field from `formatRetrievedContext`
  - [x] Step 1.3.2 — Simplify `Heading` path to leaf-only

### Phase 2 — Intent Router (Architectural Refactor)
- [x] Layer 2.0 — Pre-flight (do BEFORE touching code)
  - [x] Step 2.0.1 — Build golden test set: 30-50 queries with expected intents + expected response qualities
  - [x] Step 2.0.2 — Snapshot baseline: run test set through current pipeline, save outputs
- [x] Layer 2.1 — Decider redesign
  - [x] Step 2.1.1 — Write lean decider prompt (~300 tokens, intent-only)
  - [x] Step 2.1.2 — Add conservative bias rule + language hint
  - [x] Step 2.1.3 — Switch decider model to `llama-3.1-8b-instant`
  - [~] Step 2.1.4 — Move searchQuery generation: code-side for English/Hinglish, LLM-side for Devanagari/pronouns only — DEFERRED: savings ~80-100 tokens vs real risk of RAG quality degradation on misspelled/broken queries. Semantic embeddings already handle minor misspellings. Revisit only if Phase 2.3 doesn't hit token target.
  - [x] Step 2.1.5 — Run golden test set, validate ≥95% intent accuracy vs baseline
- [x] Layer 2.2 — Code-side safety net (Blind Spot 1 defense)
  - [x] Step 2.2.1 — Embedding similarity probe (intentSafetyNet.js) — keyword approach rejected, replaced with language-agnostic vector probe
  - [x] Step 2.2.2 — Intent override logic in askOrchestrator.js — fires for GREETING/OUT_OF_CONTEXT only
  - [x] Step 2.2.3 — Devanagari: no separate step needed — Gemini embeddings handle all languages natively, retriever already has Devanagari logic
  - [x] Step 2.2.4 — Override logging in tokenLogger.js — override_rate% per intent, [SAFETY-NET] tag in turn summary
- [x] Layer 2.3 — Intent prompt files (the heart of refactor)
  - [x] Step 2.3.1 — Create `backend/src/prompts/intents/` folder + `corePersona.js` partial — tone updated: Babu/Beta removed, action-based warmth added
  - [x] Step 2.3.2 — Write `greetingPrompt.js` — corePersona + history(4) + 3 message types (greeting/emotional/meta-reaction)
  - [x] Step 2.3.3 — Write `redirectPrompt.js` — no persona, no history, polite 1-2 sentence redirect
  - [x] Step 2.3.3b — Write `unsafePrompt.js` — no persona, firm boundary-setting tone, separate from redirect
  - [x] Step 2.3.4 — Write `chooseCoursePrompt.js` — corePersona + curriculum + history(4)
  - [x] Step 2.3.5 — Write `explainMorePrompt.js` — corePersona + RAG + history(6) + variation mandate
  - [x] Step 2.3.6 — Write `conceptQuestionPrompt.js` — corePersona + RAG + history(6) + strict grounding
  - [x] Step 2.3.7 — Write `nextStepPrompt.js` — corePersona + RAG + history(2) + CHAPTER_COMPLETE handled in step6
- [x] Layer 2.4 — Dispatch & integration
  - [x] Step 2.4.1 — Created `intentRouter.js` in `ask/` (cleaner than in step6) — INTENT_CONFIG map + HISTORY_WINDOW + lazy chain cache
  - [x] Step 2.4.2 — Refactored `step6.generateResponse.js` — full-object signature, flag check at top, legacy path untouched
  - [x] Step 2.4.3 — Added `recentMessages` to `step3.buildContext.js` return object (1-line change)
  - [x] Step 2.4.4 — All 3 guards ported: Guard2 (title rescue) + Guard1+3 (GREETING status firewall) inside `routeToIntentHandler()`
  - [x] Step 2.4.5 — Added `INTENT_MEMORY_WHITELIST` + updated `sanitizeMemoryUpdate()` + removed old EXPLAIN_MORE guard in step7
- [x] Layer 2.5 — Rollout safety
  - [x] Step 2.5.1 — `USE_INTENT_ROUTER=true` added to backend/.env; flag check live in step6.generateResponse.js:123
  - [x] Step 2.5.2 — Legacy path intact in step6 (line 128+), tutorPrompt.js alive as fallback
  - [x] Step 2.5.3 — Tested last session: 4 rounds, all intents routing correctly through intent router
  - [~] Step 2.5.4 — SKIPPED: app not deployed yet, no real users exist. Revisit after Stage 12 deployment.
- [~] Layer 2.6 — Cleanup (DEFERRED — post-deployment)
  - [ ] Step 2.6.1 — After deployment stable for 2 weeks, delete monolithic tutorPrompt.js legacy path
  - [ ] Step 2.6.2 — Remove `USE_INTENT_ROUTER` flag from .env and step6

### Phase 3 — Session Integrity Guard (Conversational Drift Prevention) ⚠️ HIGH PRIORITY — Next after Phase 2
- [ ] Layer 3.1 — Consecutive Non-Academic Turn Counter
  - [ ] Step 3.1.1 — Add `consecutiveNonAcademicTurns` + `totalNonAcademicTurns` fields to session schema
  - [ ] Step 3.1.2 — Update counter in step7 after each turn (increment on GREETING/OOC, reset on academic)
- [ ] Layer 3.2 — Progressive Redirect Enforcement
  - [ ] Step 3.2.1 — Define 3 drift tiers + inject tier instruction into GREETING prompt context
  - [ ] Step 3.2.2 — Hard session-level non-academic turn cap (env-configurable, default 10)
- [ ] Layer 3.3 — Monitoring & Visibility
  - [ ] Step 3.3.1 — Log drift tier in turn summary (tokenLogger)
  - [ ] Step 3.3.2 — Add drift stats to per-intent aggregates

### Phase 4 — Caching Probe (Conditional Bonus)
- [ ] Layer 4.1 — Provider capability check
  - [ ] Step 4.1.1 — Send 5 identical Groq API calls, inspect for `cache_read_input_tokens` field
  - [ ] Step 4.1.2 — If found: document the cache TTL, hit rate, savings. If not: abandon Phase 4.
- [ ] Layer 4.2 — Enable caching (only if probe succeeded)
  - [ ] Step 4.2.1 — Lock all system prompts (version stamp them)
  - [ ] Step 4.2.2 — Enable caching flag in `ChatGroq` constructor (verify LangChain support or use direct SDK)
  - [ ] Step 4.2.3 — Monitor cache hit rate for 1 week

### Phase 5 — History Compression (Only If Needed)
- [ ] Layer 5.1 — Decision gate
  - [ ] Step 5.1.1 — Measure: after Phase 2+3 stable, is avg turn count ≥12 at 30k? If yes, SKIP Phase 5.
- [ ] Layer 5.2 — Compressed history (if needed)
  - [ ] Step 5.2.1 — Design compressed format (`Zuno [Topic: X]: brief summary`)
  - [ ] Step 5.2.2 — Implement in `formatRecentHistory` with intent-aware switch (full for EXPLAIN_MORE, compressed elsewhere)
  - [ ] Step 5.2.3 — Validate on golden test set

---

## 6. Phase 0 — Instrumentation Upgrade

### Phase Goal
Make the invisible visible. Today's logger shows dynamic context tokens but **hides** the largest cost: static system prompts (~2,600 tokens/turn). Without this fix, every subsequent phase's impact is unmeasurable.

### Why This Must Be Phase 0 (not later)
A senior engineering principle: **measure before you cut, measure after you cut.** Without proper measurement:
- You can't prove Phase 1 worked
- You can't prove Phase 2 hit target
- You can't detect regressions
- You can't make Phase 4 go/no-go decision

### Total Estimated Effort: 1-2 hours

---

### Layer 0.1 — Static Prompt Token Counter

#### Step 0.1.1 — Add `estimateSystemPromptTokens()` helper to tokenLogger

**What:**
A new function in [tokenLogger.js](backend/src/utils/tokenLogger.js) that returns the approximate token count of each system prompt (decider, tutor). Today the logger explicitly excludes these (`tokenLogger.js:43` says "Static system prompts ~2,600 tokens not included").

**Why:**
- Currently a comment claims "~2,600 tokens" — but no one verifies if that number is correct
- Different LLM calls have different system prompts; need per-call accurate count
- Phase 2 will split tutor into 6 prompts with different sizes — need to track each

**Where (specific files):**
- [backend/src/utils/tokenLogger.js](backend/src/utils/tokenLogger.js) — add helper
- [backend/src/prompts/deciderPrompt.js](backend/src/prompts/deciderPrompt.js) — read static system message
- [backend/src/prompts/tutorPrompt.js](backend/src/prompts/tutorPrompt.js) — read static system message

**How (implementation sketch):**
```js
// In tokenLogger.js
import { deciderPrompt } from '../prompts/deciderPrompt.js';
import { tutorResponsePrompt } from '../prompts/tutorPrompt.js';

// Extract the literal system message text from a ChatPromptTemplate.
// Note: LangChain stores it in promptMessages[0].prompt.template
const extractSystemPromptText = (chatPromptTemplate) => {
  const sysMsg = chatPromptTemplate?.promptMessages?.[0];
  return sysMsg?.prompt?.template ?? '';
};

// Cache the counts at module load (system prompts are static)
const SYSTEM_PROMPT_TOKENS = {
  DECIDER: approxTokens(extractSystemPromptText(deciderPrompt)),
  TUTOR: approxTokens(extractSystemPromptText(tutorResponsePrompt)),
};

export const getSystemPromptTokens = (callName) => SYSTEM_PROMPT_TOKENS[callName] ?? 0;
```

**Edge cases:**
- LangChain internal structure may differ — verify `promptMessages[0].prompt.template` is the right path. Run `console.log(JSON.stringify(deciderPrompt, null, 2))` once to confirm.
- If template uses chained partials or runtime composition, static extraction may miss parts. For Phase 0, this is acceptable — our prompts are simple inline templates.
- Phase 2 will introduce 6 new prompts. This helper should generalize: take any ChatPromptTemplate, return its system token count.

**Hidden risks:**
- If LangChain changes their internal API (`promptMessages[0].prompt.template`), this breaks. **Mitigation:** add a smoke test that fails loud at server start if system prompt extraction returns empty string for known prompts.

**Test plan:**
1. Add helper, call it at server start, log: `[SYSTEM PROMPTS] Decider: ~XXX tokens, Tutor: ~XXX tokens`
2. Manually verify the numbers are reasonable (decider ~800-1000, tutor ~1500-1800)
3. If `approxTokens()` returns 0 — extraction failed, debug LangChain template structure

**Rollback:**
Pure additive function. Just don't call it. Zero impact.

**Completion criteria:**
- Helper function exists and exports cleanly
- Server start logs decider + tutor system prompt token counts
- Numbers are non-zero and within expected range

**Token impact:** None. Pure measurement.

---

#### Step 0.1.2 — Wire static count into `logCallTokens` output

**What:**
Modify `logCallTokens()` in [tokenLogger.js](backend/src/utils/tokenLogger.js) (line 56) to include system prompt cost in the breakdown printed after each LLM call.

**Why:**
Today the log shows `[DECIDER] in:1842 + out:98 = 1940 tokens`. The `1842` already INCLUDES the system prompt (provider counts it as input). But the developer reading logs has no way to know "of that 1842, 900 is the static prompt and 942 is the dynamic part." Breaking it down enables targeted optimization.

**Where:**
- [backend/src/utils/tokenLogger.js:56-63](backend/src/utils/tokenLogger.js) — modify `logCallTokens`

**How:**
```js
export const logCallTokens = (callName, breakdown, meta = {}) => {
  const { input = 0, output = 0, total = 0 } = breakdown;
  const sysTokens = getSystemPromptTokens(callName);
  const dynInput = Math.max(0, input - sysTokens);  // input minus system = dynamic part
  const metaStr = Object.entries(meta).map(([k, v]) => `${k}:${v}`).join(' | ');
  console.log(
    `[${callName.padEnd(7)}] sys:${pad(sysTokens,5)} + dyn:${pad(dynInput,5)} + out:${pad(output,5)} = ${pad(total,6)}` +
    (metaStr ? `  |  ${metaStr}` : '')
  );
};
```

**Edge cases:**
- `input - sysTokens` could be negative if `approxTokens` overestimates system prompt. The `Math.max(0, ...)` guards against this.
- If `approxTokens` is way off (>20% error), the breakdown misleads. Acceptable for relative tracking; not for billing.

**Hidden risks:**
- Token count from `approxTokens` is `chars/4` heuristic. Real tokenizer may differ by ±10%. Don't claim exact numbers in any communication based on these logs.

**Test plan:**
1. Send 5 test queries through the system
2. Verify log output now shows `sys:XXX + dyn:YYY + out:ZZZ` for both DECIDER and TUTOR
3. Confirm `sys + dyn ≈ input` (small drift acceptable due to approximation)

**Rollback:**
Revert one function. Zero behavior change.

**Completion criteria:**
- Logs show 3-part breakdown for every LLM call
- Numbers are sensible (decider sys ~900, tutor sys ~1700)
- No production failures

**Token impact:** None.

---

### Layer 0.2 — Per-Intent Token Tracker

#### Step 0.2.1 — Tag turn summary with intent label

**What:**
The `logTurnSummary` function in tokenLogger already prints decider + tutor cost. Add the classified intent label so you can answer: "What's the avg cost of a GREETING vs CONCEPT_QUESTION turn?"

**Where:**
- [backend/src/utils/tokenLogger.js:71-97](backend/src/utils/tokenLogger.js) — `logTurnSummary` function signature + output
- [backend/src/ask/step7.saveAndRespond.js:182-189](backend/src/ask/step7.saveAndRespond.js) — caller passes `decision.intent`

**How:**
Add `intent` param to `logTurnSummary`. Print it in the box header.

```js
export const logTurnSummary = ({ sessionId, turnNumber, intent, decider, tutor, sessionTotal, sessionLimit }) => {
  // ... existing code ...
  console.log(
    `\n╔═══════════════════════════════════════════════════════════╗\n` +
    `║  TOKEN AUDIT  Session:...${shortId.padEnd(8)}  Turn: ${turnNumber}  Intent: ${(intent ?? '?').padEnd(18)}\n` +
    // ... rest unchanged
  );
};
```

In `step7.saveAndRespond.js`, update the call site:
```js
logTurnSummary({
  sessionId,
  turnNumber,
  intent: decision?.intent ?? 'UNKNOWN',  // ← add
  decider: decision?.tokenBreakdown ?? { ... },
  // ...
});
```

**Edge cases:**
- On parse-error fallback, `decision.intent` is set to 'CONCEPT_QUESTION' by `step4.decideRetrieval.js:160`. So intent label is always present.
- On pre-pipeline error (DB, validation), turn never reaches step7, no log emitted. Acceptable — those aren't counted turns.

**Hidden risks:** None — pure logging change.

**Test plan:**
1. Send 5 different queries (greeting, concept, redirect, etc.)
2. Verify each turn's TOKEN AUDIT box shows the right intent label
3. Confirm output is readable, not truncated

**Rollback:** Revert two files.

**Completion criteria:**
- Intent label visible in turn summary
- Works for all 7 intents

**Token impact:** None.

---

#### Step 0.2.2 — Add per-intent aggregate counter (in-memory, last 100 turns)

**What:**
A simple in-memory rolling counter that tracks: "across the last 100 turns, average decider+tutor cost per intent." Print this every 10 turns or on demand.

**Why:**
Single-turn logs show one data point. Aggregate logs show **patterns**. After Phase 1, you want to see: "GREETING avg dropped from 3300 → 2150. CONCEPT avg dropped from 7500 → 4800." Without aggregates, you only have noisy single samples.

**Where:**
- [backend/src/utils/tokenLogger.js](backend/src/utils/tokenLogger.js) — add new module-level state + function

**How:**
```js
const intentStats = new Map();  // intent → { count, totalTokens, samples: [last 100] }
const MAX_SAMPLES = 100;

export const recordIntentSample = (intent, totalTokens) => {
  if (!intent || !Number.isFinite(totalTokens)) return;
  const stats = intentStats.get(intent) || { count: 0, totalTokens: 0, samples: [] };
  stats.count++;
  stats.totalTokens += totalTokens;
  stats.samples.push(totalTokens);
  if (stats.samples.length > MAX_SAMPLES) stats.samples.shift();
  intentStats.set(intent, stats);
};

export const logIntentAggregates = () => {
  console.log('\n[INTENT TOKEN AGGREGATES]');
  for (const [intent, stats] of intentStats.entries()) {
    const avg = Math.round(stats.totalTokens / stats.count);
    const recentAvg = stats.samples.length
      ? Math.round(stats.samples.reduce((a,b)=>a+b, 0) / stats.samples.length)
      : 0;
    console.log(`  ${intent.padEnd(20)} count:${pad(stats.count,4)}  alltime_avg:${pad(avg,5)}  last100_avg:${pad(recentAvg,5)}`);
  }
};
```

Then in `step7.saveAndRespond.js`, after `logTurnSummary`, call:
```js
recordIntentSample(decision?.intent, turnTotal);
if (turnNumber % 10 === 0) logIntentAggregates();
```

**Edge cases:**
- In-memory state lost on server restart. For dev environment, acceptable. For production-grade tracking, persist to MongoDB later.
- Stats grow per intent (max 7 entries). Memory bounded.

**Hidden risks:**
- Concurrent requests writing to the same Map — Node single-threaded JS event loop = safe for our use.
- If process is long-running, in-memory only = lose history on restart. Acceptable for dev.

**Test plan:**
1. Send 30 mixed queries across intents
2. Verify aggregate log appears every 10 turns
3. Verify per-intent averages are reasonable

**Rollback:** Pure additive. Remove the recording call.

**Completion criteria:**
- Aggregate log fires every 10 turns
- Each intent gets its own row
- Counts match number of turns sent for that intent

**Token impact:** None.

---

### Layer 0.3 — Cache Hit Detector (Phase 3 readiness)

> **REVISED 2026-06-17:** Original plan probed Groq-specific field only. Architecture uses 3 providers
> (Groq, OpenAI, Google Gemini) switchable via `LLM_PROVIDER` env var, with hybrid use planned.
> Groq-specific detection breaks when provider changes. Revised to provider-agnostic detection.
> See Open Decisions Log entry for full reasoning.

#### Step 0.3.1 — Provider-agnostic cache field detector in `extractTokenBreakdown`

**What:**
Extend the `extractTokenBreakdown` helper (used in both step4 and step6) to check cache-related
fields from ALL supported providers. Log whatever is found — provider identity doesn't matter
for the measurement goal.

**Why:**
Each provider surfaces cache hits differently:
- Groq: `usage.promptTokensCached` or `usage.cache_read_input_tokens`
- OpenAI: `usage.prompt_tokens_details?.cached_tokens` (automatic, no config — fires on prompts >1024 tokens)
- Google Gemini: separate Context Caching API (out of scope for this probe)

OpenAI caching may ALREADY be active if prompts exceed 1024 tokens — no flag needed.
This probe tells us: "with our current provider, is caching happening and how much?"

**Where:**
- [backend/src/ask/step4.decideRetrieval.js](backend/src/ask/step4.decideRetrieval.js) — `extractTokenBreakdown` function
- [backend/src/ask/step6.generateResponse.js](backend/src/ask/step6.generateResponse.js) — same
- [backend/src/utils/tokenLogger.js](backend/src/utils/tokenLogger.js) — `logCallTokens` to display cached tokens

**How:**
```js
// Provider-agnostic cache token extractor
const extractCacheTokens = (usage) => {
  const groqCached   = usage.promptTokensCached ?? usage.cache_read_input_tokens ?? 0;
  const openaiCached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return groqCached || openaiCached || 0;
};

const extractTokenBreakdown = (output) => {
  const usage = output?.llmOutput?.tokenUsage || {};
  return {
    input:      usage.promptTokens    ?? 0,
    output:     usage.completionTokens ?? 0,
    total:      usage.totalTokens      ?? 0,
    cached:     extractCacheTokens(usage),
  };
};
```

In `logCallTokens`, if `cached > 0`, append `| cached:${cached}` to output.
In `logTurnSummary`, show cached tokens in the box if non-zero.

**Edge cases:**
- Gemini: does not surface cache in standard usage — `cached` will always be 0. Gemini caching is a separate API decision.
- If provider changes mid-session: only the active provider's fields will be non-zero — still correct.
- `cached > input`: impossible. If seen, approxTokens drift — log warning.

**Test plan:**
1. Run 5 queries with current provider (Groq default)
2. Check if `cached:` appears in logs — if yes, Groq caching is active
3. Switch `LLM_PROVIDER=openai` in .env, run 5 queries
4. Check if `cached:` appears — OpenAI auto-caches prompts >1024 tokens, likely YES
5. Document findings in Open Decisions Log

**Rollback:** Revert two files (step4, step6). tokenLogger change is additive.

**Completion criteria:**
- `extractTokenBreakdown` returns `cached` field for all providers
- `logCallTokens` shows `cached:X` when non-zero
- Per-provider finding documented in Section 12

**Token impact:** None.

---

#### Step 0.3.2 — Track cache savings in per-intent aggregates

**What:**
Extend `recordIntentSample` to also track cumulative cached tokens per intent.
Add `cached_avg` column to `logIntentAggregates` output.

**Why:**
Single-turn `cached:X` tells us one data point. Aggregate tells us: "CONCEPT_QUESTION turns
save avg 1200 cached tokens each — that's 16% cost reduction just from auto-caching."
This directly informs Phase 3 go/no-go decision.

**Where:**
- [backend/src/utils/tokenLogger.js](backend/src/utils/tokenLogger.js) — extend `recordIntentSample` + `logIntentAggregates`
- [backend/src/ask/step7.saveAndRespond.js](backend/src/ask/step7.saveAndRespond.js) — pass cached tokens to recordIntentSample

**How:**
```js
// tokenLogger.js
export const recordIntentSample = (intent, totalTokens, cachedTokens = 0) => {
  // ... existing logic ...
  stats.totalCached += cachedTokens;
};

// logIntentAggregates — add cached_avg column
console.log(`  ${intent.padEnd(20)} count:${pad(stats.count,4)}  avg:${pad(avg,5)}  cached_avg:${pad(cachedAvg,5)}`);
```

**Edge cases:**
- `cachedTokens` defaults to 0 — backward compatible with existing call sites.
- If Step 0.3.1 found caching unavailable on all providers, `cached_avg` will always be 0.
  That's fine — it proves Phase 3 has no value.

**Test plan:**
1. Run 20 queries
2. Check aggregate log shows `cached_avg` column
3. If always 0: caching inactive — document and abandon Phase 3
4. If non-zero: document hit rate and avg savings

**Rollback:** Pure additive — revert recordIntentSample signature change.

**Completion criteria:**
- Aggregate log shows `cached_avg` per intent
- Phase 3 go/no-go decision documented in Section 12

**Token impact:** None.

---

### Phase 0 Exit Criteria
Before declaring Phase 0 complete:
- [x] Server start logs static system prompt token counts — `[SYSTEM PROMPTS] Decider: ~1336 | Tutor: ~2502`
- [x] Every LLM call log shows `sys + dyn + out` breakdown — confirmed across all 3 turns
- [x] Turn summary log includes intent label — GREETING, CONCEPT_QUESTION, EXPLAIN_MORE confirmed
- [x] Aggregate log fires every 10 turns with per-intent averages — unit tested 5/5, wiring confirmed in step7
- [x] Caching probe is complete — Gemini 2.5-flash: no `cached:` field → auto-caching inactive. Phase 3 decision pending OpenAI test.
- [x] At least 1 real session of 5+ turns has been observed in logs — 3 real turns observed, session locked at 15k limit (logging worked flawlessly, lock confirms Phase 1 urgency)

---

## 7. Phase 1 — Safe Wins

### Phase Goal
Apply Solution-1 trims (low-risk, no architecture change). Each change is independently reversible. Combined target: ~30% reduction in per-turn tokens.

### Total Estimated Effort: 3-4 hours

### Why Phase 1 Before Phase 2
- Builds momentum with measurable wins
- Validates Phase 0's measurement infrastructure
- Reduces Phase 2's surface area (less to migrate)
- Each fix is independently revertable — low risk
- Several Phase 1 fixes are bugs we noticed during analysis, not just optimizations

---

### Layer 1.1 — Tutor Input Bloat Fixes

#### Step 1.1.1 — Remove `lastTutorResponse` duplicate from tutor invoke

**What:**
The `lastTutorResponse` field passed to tutor is **the same content** as the last "Zuno: ..." line in the `history` field. Sending both = same text twice = ~400 tokens wasted per turn.

**Background:**
TOKEN_FIX_PLAN STEP-1 removed this duplicate from the **decider** but left it in the **tutor**. Confirmed by re-reading `step6.generateResponse.js:148`.

**Where:**
- [backend/src/prompts/tutorPrompt.js:160-161](backend/src/prompts/tutorPrompt.js) — remove `{lastTutorResponse}` template variable
- [backend/src/ask/step6.generateResponse.js:103](backend/src/ask/step6.generateResponse.js) — remove `lastTutorResponse` from function signature
- [backend/src/ask/step6.generateResponse.js:148](backend/src/ask/step6.generateResponse.js) — remove from invoke call
- [backend/src/ask/step3.buildContext.js:89,109](backend/src/ask/step3.buildContext.js) — stop computing it (or keep for now, just don't pass to step6)

**How:**
1. In `tutorPrompt.js`, remove the `Previous Turn Tracker:\n{lastTutorResponse}` block (lines 160-161)
2. In the system prompt, update the "ANTI-REPETITION RULE" reference: change "The 'Previous Turn Tracker' shows your last response" to "Look at the most recent 'Zuno:' entry in the Recent Conversation Log"
3. In `step6.generateResponse.js:103`, remove `lastTutorResponse` from destructured context param
4. Line 148: remove `lastTutorResponse,` from invoke object
5. In `step3.buildContext.js`, keep computing `lastTutorResponse` (it's still in the returned object for backward compat) but no harm — it's just unused. Optionally remove from return for cleanliness.

**Edge cases:**
- **Turn 1**: history is "No previous messages." — fine, no Zuno entry to reference.
- **EXPLAIN_MORE intent**: the tutor needs to know last response to vary explanation. Now it must look in history. The system prompt update tells it where to look. Validated approach.
- **Long history**: last Zuno entry might be many lines down. LLM still finds it (LLMs scan well).

**Hidden risks:**
- LLM might "miss" the last Zuno entry if it's deep in history (turn 7+). **Test specifically**: turn 7+ EXPLAIN_MORE — does it still vary correctly?
- The system prompt change might subtly weaken variation rule. **Watch in test set**: do back-to-back same-topic queries produce different angles?

**Test plan:**
1. Single greeting turn: response should be normal
2. CONCEPT_QUESTION + same topic again: tutor should vary explanation (anti-repetition still works)
3. EXPLAIN_MORE after CONCEPT_QUESTION: should re-explain with different angle
4. Token logs: confirm tutor input drops ~400 tokens compared to pre-fix baseline (turn 2+)

**Rollback:**
1. Re-add `lastTutorResponse` to tutorPrompt.js human message
2. Re-add to step6 function signature
3. Re-add to invoke object
4. Revert system prompt change

**Completion criteria:**
- Tutor input tokens dropped ~400 on turn 2+
- Anti-repetition behavior preserved (validated via test queries)
- No regression in EXPLAIN_MORE quality

**Token impact:** ~400 tokens/turn savings on turn 2+.

---

#### Step 1.1.2 — Remove `decision` JSON pretty-print bloat

**What:**
The `decision` field passed to tutor is:
```js
decision: JSON.stringify({ responseMode, intent }, null, 2)
```
This is **pretty-printed** (the `null, 2` adds newlines + indentation). Also: `responseMode` is already passed separately as its own parameter. The `intent` info adds little — tutor's behavior switches on `responseMode`, not raw intent.

**Where:**
- [backend/src/ask/step6.generateResponse.js:145](backend/src/ask/step6.generateResponse.js) — line with `decision: JSON.stringify(...)`
- [backend/src/prompts/tutorPrompt.js:151-152](backend/src/prompts/tutorPrompt.js) — `{decision}` template variable

**Decision (two options):**

**Option A (recommended): Compact JSON only**
- Change `JSON.stringify({...}, null, 2)` → `JSON.stringify({...})`
- Saves ~20-30 tokens. Lower risk.

**Option B: Remove entirely**
- Drop the field from invoke + prompt template
- Saves ~40-50 tokens. Slightly higher risk (in case any prompt branch references intent specifically).

Pick Option A for Phase 1 (safe). Phase 2's intent router will remove this entirely anyway.

**How (Option A):**
```js
// Before:
decision: JSON.stringify({ responseMode, intent }, null, 2),

// After:
decision: JSON.stringify({ responseMode, intent }),
```

**Edge cases:** None — pure format change, content identical.

**Hidden risks:**
- LLM parsing of compact JSON vs pretty-printed: identical for modern LLMs. No quality impact.

**Test plan:**
1. Send 5 mixed queries
2. Check tutor output is correct (intent-appropriate behavior unchanged)
3. Token logs confirm ~30 tokens saved per turn

**Rollback:** One-line revert.

**Completion criteria:**
- Tutor input tokens drop ~30 every turn
- No behavior regression

**Token impact:** ~30 tokens/turn.

---

#### Step 1.1.3 — Convert `focusChapter` JSON → compact string

**What:**
`buildFocusChapterPrompt` in [step3.buildContext.js:13-28](backend/src/ask/step3.buildContext.js) returns:
```js
JSON.stringify({
  subjectId, subjectTitle, sectionId, sectionTitle,
  chapterId, chapterNumber, chapterTitle,
})
```
~70 tokens of JSON with IDs the tutor doesn't reference. Tutor only needs the human-readable path: "Science > Biology > Ch 1: Life Processes" (~15 tokens).

**Where:**
- [backend/src/ask/step3.buildContext.js:13-28](backend/src/ask/step3.buildContext.js) — `buildFocusChapterPrompt` function

**How:**
```js
const buildFocusChapterPrompt = (focusChapter) => {
  if (!focusChapter) {
    return 'No focus chapter selected.';
  }
  return `${focusChapter.subjectTitle} > ${focusChapter.sectionTitle} > Ch ${focusChapter.number}: ${focusChapter.title}`;
};
```

**Edge cases:**
- `focusChapter.number` could be undefined for legacy data. Use `focusChapter.number ?? '?'`.
- Special characters in chapter title: should already be clean since they come from curriculum index.

**Hidden risks:**
- Any prompt logic that parses focusChapter as JSON would break. Verify by grep: `grep -r "focusChapter" backend/src/prompts/` and `grep -r "focusChapterPrompt" backend/src/`. Confirm no JSON.parse calls on this field.
- Frontend doesn't see this — it's internal to LLM prompts. Safe.

**Test plan:**
1. Focus mode session: open Biology Ch 1, send a question
2. Tutor should answer with chapter context preserved
3. Token logs confirm focusChapter slot dropped ~55 tokens

**Rollback:** Revert function body.

**Completion criteria:**
- Tutor input tokens drop ~55 every turn (focus mode)
- Chapter context still apparent in tutor responses

**Token impact:** ~55 tokens/turn in focus mode.

---

### Layer 1.2 — Decider Input Bloat Fixes

#### Step 1.2.1 — Remove `currentStudyContext` from decider invoke

**What:**
[step4.decideRetrieval.js:122](backend/src/ask/step4.decideRetrieval.js) passes `currentStudyContext` to the decider. This string ("Active Subject: Science > Biology...") is **dead weight** for intent classification — decider doesn't use chapter info to determine intent.

**Where:**
- [backend/src/prompts/deciderPrompt.js:67-68](backend/src/prompts/deciderPrompt.js) — `{currentStudyContext}` template variable
- [backend/src/ask/step4.decideRetrieval.js:111](backend/src/ask/step4.decideRetrieval.js) — function signature
- [backend/src/ask/step4.decideRetrieval.js:122](backend/src/ask/step4.decideRetrieval.js) — invoke object

**How:**
1. In `deciderPrompt.js`, remove the "Current Study Placement Context (Semantic Hydration):\n{currentStudyContext}\n" block from the human message
2. In `step4.decideRetrieval.js:111`, remove `currentStudyContext` from destructured context
3. In invoke object: remove `currentStudyContext,` line

**Edge cases:**
- **EXPLAIN_MORE intent**: needs reference resolution. Does it use studyContext? Check: no — deciderPrompt EXPLAIN_MORE special rule (line 34) tells it to look at history. studyContext is redundant.
- **Devanagari translation**: decider translates Hindi topics to English for searchQuery. studyContext doesn't help here. Safe to remove.

**Hidden risks:**
- Pronoun resolution ("iska kya matlab?") — does decider use studyContext to resolve? Check deciderPrompt line 49: "If the student uses relative terms... evaluate the 'Recent Turn Conversational Logs'." History is the resolver, not studyContext. Safe.

**Test plan:**
1. Send "iska kya matlab" after a CONCEPT turn — decider should still classify as CONCEPT/EXPLAIN_MORE and generate sensible searchQuery
2. Send Hindi topic ("प्रकाश संश्लेषण") — decider should translate via its own training, not via studyContext hint
3. Token logs: decider input drops ~30 tokens

**Rollback:** Revert three files.

**Completion criteria:**
- Decider input tokens drop ~30 every turn
- All 7 intents still classified correctly on test set

**Token impact:** ~30 tokens/turn.

---

#### Step 1.2.2 — Remove `focusChapter` from decider invoke

**What:**
Same logic as 1.2.1, but for `focusChapter`. Decider doesn't classify intent based on which chapter is active — classification is content-driven, not state-driven.

**Where:**
- [backend/src/prompts/deciderPrompt.js:74-75](backend/src/prompts/deciderPrompt.js) — `{focusChapter}` template variable in human message
- [backend/src/ask/step4.decideRetrieval.js:111](backend/src/ask/step4.decideRetrieval.js) — destructured context
- [backend/src/ask/step4.decideRetrieval.js:124](backend/src/ask/step4.decideRetrieval.js) — invoke object

**How:**
1. In deciderPrompt human message, remove "Focus Mode Active Target Chapter Schema:\n{focusChapter}"
2. In step4 destructure: remove `focusChapterPrompt`
3. In step4 invoke: remove `focusChapter: focusChapterPrompt,`

**Edge cases:**
- **CHOOSE_COURSE classification**: student says "physics padhna hai." Decider should classify regardless of currently-active chapter. Behavior unchanged.
- **NEXT_STEP intent**: depends on current chapter. But decider doesn't generate searchQuery for NEXT_STEP (step5 handles it). Safe.

**Hidden risks:**
- If a future intent depends on focus chapter for classification, need to re-add. Not a current need.

**Test plan:**
1. In focus mode (Biology Ch 1), send "physics padhna hai" — should classify as CHOOSE_COURSE
2. Send "aage badho" — should classify as NEXT_STEP regardless of chapter
3. Token logs: decider input drops ~70 tokens

**Rollback:** Revert three files.

**Completion criteria:**
- Decider input tokens drop ~70 every turn
- CHOOSE_COURSE and NEXT_STEP classifications unaffected

**Token impact:** ~70 tokens/turn.

---

#### Step 1.2.3 — Add language hint to decider input (Bug D fix)

**What:**
Per Blind Spot 5 Bug D: decider doesn't receive a language hint. For Devanagari input, the decider has to detect language from the message itself, which a smaller model (Phase 2 will use 8B) may handle worse than 70B.

Add a language hint to help the decider, especially for Phase 2 when we switch to a smaller model.

**Where:**
- [backend/src/ask/step3.buildContext.js:78](backend/src/ask/step3.buildContext.js) — language is already detected here as `language.detectedLanguage`
- [backend/src/ask/step4.decideRetrieval.js:111,121](backend/src/ask/step4.decideRetrieval.js) — pass language hint
- [backend/src/prompts/deciderPrompt.js](backend/src/prompts/deciderPrompt.js) — add `{detectedLanguage}` template variable

**How:**
1. step3 already produces `language.detectedLanguage` (e.g., "hindi", "hinglish", "english")
2. Pass it into decideRetrieval call (orchestrator or step4 signature)
3. In deciderPrompt human message, add 1 line: `Student message language: {detectedLanguage}`
4. In invoke: add `detectedLanguage: language.detectedLanguage` (or pass via context)

**Edge cases:**
- Mixed language ("Hello, photosynthesis kya hai?") — languageDetector handles this; output may be "hinglish". Tag as such.
- Unknown language — fallback to "unknown" or "hinglish". Test.

**Hidden risks:**
- Adding the hint increases decider input by ~5 tokens. Net positive because it improves 8B accuracy on Devanagari in Phase 2.

**Test plan:**
1. Send Devanagari query, English query, Hinglish query
2. Verify decider input shows correct language hint in logs
3. Confirm intent classification accuracy still high

**Rollback:** Revert three files. Add ~5 tokens back, no harm.

**Completion criteria:**
- Language hint visible in decider input
- All three language modes classified correctly

**Token impact:** -5 tokens/turn (slight increase, intentional). Net positive for Phase 2 accuracy.

---

### Layer 1.3 — RAG Context Trimming

#### Step 1.3.1 — Remove `Chunk ID` field from `formatRetrievedContext`

**What:**
`formatRetrievedContext` in [promptHelpers.js:91-97](backend/src/ask/promptHelpers.js) adds a `Chunk ID: ${metadata.chunk_id || ...}` line to each RAG chunk. The LLM **never references chunk IDs** in its output. It's debugging metadata leaking into the prompt.

**Where:**
- [backend/src/ask/promptHelpers.js:91-97](backend/src/ask/promptHelpers.js) — remove the `Chunk ID:` line from the chunk template

**How:**
```js
return `[Source ${index + 1}]
Chapter: ${metadata.chapter_title || 'Unknown'}
Heading: ${metadata.heading_path || 'Unknown'}
Content:
${content}`;
```
(Just delete the `Chunk ID:` line.)

**Edge cases:**
- Sources still returned to frontend via separate `formatSources` (sourceFormatter.js). Chunk IDs preserved there for debugging. Unaffected.

**Hidden risks:**
- None — chunk ID was purely cosmetic in the RAG prompt context.

**Test plan:**
1. Send a CONCEPT_QUESTION
2. Verify tutor response is correct
3. Check API response still has correct `sources` array with chunk IDs (frontend-facing)
4. Token logs: tutor input drops ~50 tokens (10 per chunk × 5 chunks)

**Rollback:** Re-add one line.

**Completion criteria:**
- Tutor input drops ~50 tokens on CONCEPT/EXPLAIN_MORE/NEXT_STEP turns
- Sources array in API response unchanged

**Token impact:** ~50 tokens/turn on RAG-active turns.

---

#### Step 1.3.2 — Simplify `Heading` path to leaf-only

**What:**
`metadata.heading_path` is currently the full hierarchy: `"Chapter 9 > Refraction of Light > Refractive Index"` — ~10 tokens. The tutor mostly needs the leaf ("Refractive Index"). Chapter title is already on a separate line (`Chapter:`).

**Where:**
- [backend/src/ask/promptHelpers.js:91-97](backend/src/ask/promptHelpers.js) — modify the Heading line

**How:**
```js
const extractLeafHeading = (headingPath) => {
  const parts = String(headingPath || '').split('>');
  return (parts[parts.length - 1] || 'Unknown').trim();
};

// In the template:
Heading: ${extractLeafHeading(metadata.heading_path)}
```

**Edge cases:**
- `heading_path` undefined or empty: fallback to 'Unknown'.
- Single-level heading (no `>`): leaf is the whole string. OK.

**Hidden risks:**
- LLM might use heading hierarchy for context. Watch quality on chapter-spanning queries (e.g., "tell me about Refraction in general" — does it use surface chunks correctly without breadcrumb context?). Chapter title is still on its own line, so the breadcrumb context isn't fully lost.

**Test plan:**
1. Run 5 CONCEPT queries
2. Compare tutor response quality vs baseline
3. Token logs: ~20 tokens saved per chunk (5 chunks × 20 = 100 tokens)

**Rollback:** Re-use `metadata.heading_path` directly.

**Completion criteria:**
- Tutor input drops ~100 tokens on RAG-active turns
- Response quality unaffected (validated on test set)

**Token impact:** ~100 tokens/turn on RAG-active turns.

---

### Phase 1 Exit Criteria
Before declaring Phase 1 complete:
- [x] All 9 steps marked done in Status Tracker
- [!] Aggregate logs show per-turn drop of ~1,000-1,500 tokens average — ACTUAL: ~184 tokens avg (3 turns). Root cause: RAG context (1,212 tokens/RAG turn) + static prompt (2,532 tokens) dominate. Phase 1 trimmed edges only. Phase 2 is the real fix.
- [x] No regression: responses quality intact across GREETING, CONCEPT_QUESTION, EXPLAIN_MORE
- [x] No quality complaints from manual usage
- [~] Aggregate logs captured for at least 30 mixed turns — SKIPPED: core signal clear from 3 turns, Phase 2 was the real fix anyway

**Phase 1 declared complete. Savings real but insufficient. Proceeding to Phase 2.**

**Estimated total savings after Phase 1:** ~1,200-1,500 tokens/turn average.

---

## 8. Phase 2 — Intent Router (The Architectural Refactor)

### Phase Goal
Replace the monolithic tutor prompt with intent-specific lean prompts. Each prompt receives ONLY the inputs it needs. This is the **single biggest token reduction** in the entire plan.

### Total Estimated Effort: 12-15 hours, spread across 4-6 sessions

### Why Phase 2 Is High-Stakes
- It's the only phase that changes architecture
- Defense layers are non-negotiable (Blind Spot 1)
- Quality regression risk is real
- All hidden guards from current tutor code must be preserved

---

### Layer 2.0 — Pre-Flight (Mandatory Before Any Code Change)

#### Step 2.0.1 — Build golden test set: 30-50 queries with expected intents + expected response qualities

**What:**
A regression test suite of real-world queries that we can run before and after Phase 2 to validate accuracy and quality.

**Why:**
Without baseline comparison, "Phase 2 done" is an unverified claim. Senior engineering: **measure quality with hard evidence, not intuition.**

**Where:**
- New file: `backend/test/golden-queries.json`
- New script: `backend/scripts/run-golden-set.js`

**How:**
Build JSON file structure:
```json
[
  {
    "id": "G01",
    "query": "Hi",
    "studyMode": "global",
    "expectedIntent": "GREETING",
    "expectedResponseMode": "conversation",
    "qualityChecks": ["warm greeting", "no science content", "asks what to study"]
  },
  {
    "id": "G02",
    "query": "Pranam sir, photosynthesis ke baare mein batao",
    "studyMode": "focus",
    "chapterId": "bio_ch_01",
    "expectedIntent": "CONCEPT_QUESTION",
    "expectedResponseMode": "study_tutor",
    "qualityChecks": ["mentions photosynthesis", "uses RAG content", "no hallucinated facts"]
  },
  // ... 30-50 total
]
```

Cover all 7 intents. Include edge cases:
- Pure Devanagari
- Pure English
- Hinglish
- Greeting+academic mixed (Blind Spot 1 test)
- Pronoun resolution ("iska kya matlab")
- "Aage badho" (NEXT_STEP)
- "Nahi samjha" (EXPLAIN_MORE)
- Out-of-scope ("IPL ki team")
- Abusive (UNSAFE)

The script runs each query through `/api/v1/ask`, captures the response, evaluates:
- Did `intent` match expected?
- Did `responseMode` match?
- Does response contain quality check phrases (heuristic — not perfect, but useful)?

**Edge cases:**
- New session per query to avoid state contamination
- DB cleanup between runs

**Hidden risks:**
- 30-50 queries is a small sample. Production has more variety. **Mitigation:** monitor production after launch, add real failures to the golden set.

**Test plan:**
1. Run script against current pipeline, save baseline output
2. Verify reasonable accuracy (≥90% on intent labels)
3. If baseline accuracy is low, fix decider issues BEFORE Phase 2

**Rollback:** N/A — pure addition.

**Completion criteria:**
- Golden set committed
- Script runs cleanly
- Baseline accuracy documented (in Section 12)

**Token impact:** None.

---

#### Step 2.0.2 — Snapshot baseline: run test set through current pipeline, save outputs

**What:**
Execute the golden test set against the current (Phase 1 complete) pipeline. Save full output (responses, token counts, intents) to a baseline JSON.

**Why:**
After Phase 2, we re-run the same test set and **diff** to validate no regression. Without baseline file, the diff is impossible.

**Where:**
- New file: `backend/test/golden-baseline-phase1.json` (output of running golden set)

**How:**
The script from Step 2.0.1 supports `--save-baseline=path.json`. Run it once after Phase 1 complete.

**Edge cases:**
- LLM is non-deterministic. Re-run 3 times, save all 3. Phase 2 outputs that match ANY of the 3 baselines are acceptable.

**Hidden risks:**
- LLM output variance: a baseline that's "right" today might not match a "right" output tomorrow. Use intent labels and quality check phrases as the comparison criteria, not literal text match.

**Test plan:**
1. Run script with `--save-baseline`
2. Inspect output JSON, verify structure
3. Manually review 10 random samples for quality

**Rollback:** N/A.

**Completion criteria:**
- Baseline file exists with 30-50 query results
- Phase 1 token costs captured per intent

**Token impact:** None. Runs cost real tokens (~150k for full set), but one-time.

---

### Layer 2.1 — Decider Redesign

> NOTE: Steps 2.1.1 through 2.1.5 will be detailed in their own deep-dive session when we reach them. The current spec below is the high-level plan.

#### Step 2.1.1 — Write lean decider prompt (~300 tokens, intent-only)
- Condense 7 intent definitions to one-liner each
- Remove redundant examples (LLM knows Hinglish)
- Remove "Routing: ..." lines (deterministic in `normalizeDecision` code)
- Add conservative bias rule (academic keyword → CONCEPT)
- Output: just `{intent, reason}` — no searchQuery, responseMode, needsRetrieval (all derivable in code)

#### Step 2.1.2 — Add conservative bias rule + language hint
- Explicit rule in system prompt: "if uncertain between conversation and academic, choose academic"
- Use language hint from Step 1.2.3

#### Step 2.1.3 — Switch decider model to `llama-3.1-8b-instant`
- One-line change in `createChatModel` call
- Validate on golden test set

#### Step 2.1.4 — Move searchQuery generation logic
- Code-side: English/Hinglish queries → use raw question as searchQuery
- Code-side: Devanagari → call a tiny dedicated translation utility (or rely on Gemini embedding's multilingual support — research needed)
- LLM-side: only for explicit pronoun resolution cases (rare)

#### Step 2.1.5 — Run golden test set, validate ≥95% intent accuracy
- Hard gate before continuing
- If accuracy drops below 95%, debug. Likely fix: tighten prompt, or revert to 70B for ambiguous cases.

**Per-step deep dive will be done when this layer is started.**

---

### Layer 2.2 — Code-Side Safety Net (Blind Spot 1 Defense)

#### Step 2.2.1 — Build academic keyword regex (~50 common science terms)

**What:**
A regex matching common Class 10 Science keywords (photosynthesis, electricity, refraction, acid, base, atom, etc.). If decider classifies as GREETING/REDIRECT but message contains a science keyword, promote to CONCEPT_QUESTION.

**Where:**
- New file: `backend/src/ask/intentSafetyNet.js`

**How:**
```js
const ACADEMIC_KEYWORDS = [
  // Physics
  'electric', 'current', 'circuit', 'voltage', 'resistance', 'magnet', 'light',
  'reflection', 'refraction', 'lens', 'mirror', 'force', 'energy', 'work',
  // Chemistry
  'atom', 'molecule', 'acid', 'base', 'salt', 'reaction', 'oxidation', 'reduction',
  'metal', 'non-metal', 'periodic', 'element', 'compound',
  // Biology
  'cell', 'photosynthesis', 'respiration', 'reproduction', 'evolution', 'genetic',
  'organism', 'heart', 'blood', 'nerve', 'hormone',
  // Hinglish/Hindi common forms
  'prakash', 'paravartan', 'amla', 'kshar', 'koshika', 'pradushan',
];
const ACADEMIC_REGEX = new RegExp(`\\b(${ACADEMIC_KEYWORDS.join('|')})\\b`, 'i');

export const hasAcademicKeyword = (query) => ACADEMIC_REGEX.test(query);
```

**Edge cases:**
- False positives: "light" appears in non-academic context ("light food", "feel light"). Acceptable cost — better to over-promote to CONCEPT (which has RAG fallback) than miss academic queries.
- Hinglish variants: include common Roman-script Hindi terms for science topics.

**Hidden risks:**
- List maintenance burden. **Mitigation:** start with most common ~50 terms, expand based on production logs.

**Test plan:**
1. Unit test with 20 sample queries
2. Verify all academic queries match, non-academic don't (allowing a few false positives)

**Rollback:** Delete file.

**Completion criteria:**
- Helper file created
- Unit tests pass
- Token impact: ~5 lookup tokens per turn (negligible)

**Token impact:** None.

---

#### Step 2.2.2 — Implement intent override logic in `step5` dispatcher entry

**What:**
After `step4` returns decision, before `step5` retrieves content, check: if intent is GREETING/REDIRECT but query has academic keyword, override.

**Where:**
- [backend/src/ask/askOrchestrator.js:76-78](backend/src/ask/askOrchestrator.js) — between decideRetrieval and retrieveContent

**How:**
```js
const decision = await decideRetrieval(input, context);

// Safety net: catch decider mis-classification of academic queries
if (['GREETING', 'OUT_OF_CONTEXT'].includes(decision.intent) &&
    hasAcademicKeyword(input.question)) {
  console.warn(`[Safety Net] Promoting ${decision.intent} → CONCEPT_QUESTION due to academic keyword`);
  decision.intent = 'CONCEPT_QUESTION';
  decision.responseMode = 'study_tutor';
  decision.needsRetrieval = true;
  decision.searchQuery = input.question;  // raw query as searchQuery fallback
  decision.inScope = true;
  decision._overridden = true;  // for metrics
}

const retrieval = await retrieveContent(decision, input, session);
```

**Edge cases:**
- UNSAFE_OR_ABUSIVE + academic keyword: do NOT override. Abuse takes precedence.
- CHOOSE_COURSE + academic keyword (e.g., "chemistry padhna hai"): leave as CHOOSE_COURSE (decider is right).

**Hidden risks:**
- Over-aggressive promotion: every "light yaar mood nahi hai" gets promoted to CONCEPT. Annoying but recoverable (RAG returns NO_RETRIEVED_CONTEXT, tutor responds gracefully).

**Test plan:**
1. Send "Pranam sir, photosynthesis batao" — should be promoted to CONCEPT
2. Send "Hi" — should stay GREETING
3. Send "IPL ki team" — should stay OUT_OF_CONTEXT (no science keyword)
4. Send "main thoda light feel kar raha hu" — false positive promotion, observe graceful fallback

**Rollback:** Remove override block.

**Completion criteria:**
- Promotion fires on academic+greeting combos
- Doesn't fire on pure greetings
- Logs visible

**Token impact:** When fires, adds ~1500 tokens (RAG runs). Acceptable cost for safety.

---

#### Step 2.2.3 — Add Devanagari detection + raw query fallback
> Deep-dive when reached.

#### Step 2.2.4 — Production logging for override triggers
> Deep-dive when reached.

---

### Layer 2.3 — Intent Prompt Files (The Heart of Refactor)

> NOTE: Each step here gets its own deep-dive session. Below is high-level scaffolding only.

#### Step 2.3.1 — Create folder + `corePersona.js` partial
- New folder: `backend/src/prompts/intents/`
- `corePersona.js` exports shared persona rules (Babu/Beta frequency, analogy rule, language enforcement, anti-claim-physical-human rule)
- ~80 tokens
- All intent prompts import + interpolate via template composition

#### Step 2.3.2 — Write `greetingPrompt.js`
- ~200 tokens system
- Inputs: query, history (last 4 messages), answerLanguageInstruction
- Output schema: `{ status: 'answered', responseMode: 'conversation', title: null, sections: [...], suggestedActions: [], memoryUpdate: {} }`
- Port: conversation mode safety override, title rescue logic
- Anti-hallucination guard: "if message contains topic name, do NOT explain, redirect to study mode"

#### Step 2.3.3 — Write `redirectPrompt.js`
- ~150 tokens system
- Inputs: query, answerLanguageInstruction
- Output: out_of_scope status

#### Step 2.3.4 — Write `chooseCoursePrompt.js`
- ~250 tokens system
- Inputs: query, curriculumSummary, focusChapter, answerLanguageInstruction
- Lists chapters from curriculum

#### Step 2.3.5 — Write `explainMorePrompt.js`
- ~400 tokens system
- Inputs: query, history (last 6), retrievedContext, last "Zuno:" line extracted from history, answerLanguageInstruction
- Port: variation mandate, anti-repetition, "if retrievedContext empty, ask for clarification"

#### Step 2.3.6 — Write `conceptQuestionPrompt.js`
- ~450 tokens system
- Inputs: query, history (last 6), retrievedContext, focusChapter, answerLanguageInstruction
- Port: strict grounding rule

#### Step 2.3.7 — Write `nextStepPrompt.js`
- ~350 tokens system
- Inputs: query, history (last 2), retrievedContext (next topic), memory (currentChapter/Topic), answerLanguageInstruction
- Port: memoryUpdate rules, "teach as next lesson"

---

### Layer 2.4 — Dispatch & Integration
> Deep-dive when reached. High-level: data-driven intent handler map in step6.

### Layer 2.5 — Rollout Safety
> Deep-dive when reached. Feature flag + 48hr soak.

### Layer 2.6 — Cleanup
> Deep-dive when reached.

---

## 9. Phase 3 — Session Integrity Guard (Conversational Drift Prevention)

> ⚠️ **HIGH PRIORITY — Jump here immediately after Phase 2 completes.**

### Phase Goal
Prevent token budget from being drained by non-academic conversations. A student repeatedly sending personal stories, casual chat, or emotional messages burns through the session token limit without any educational value. This phase adds three layers of defense: a session-level drift counter, progressive redirect enforcement (gentle → firm), and a hard cap on non-academic engagement per session.

### Why This Is A Separate Phase (Not Part of Phase 2)
Phase 2 solves: "academic query misclassified as GREETING → hallucination risk"
This phase solves: "genuine non-academic messages consuming token budget → session drained without learning"
These are fundamentally different problems requiring different solutions. Mixing them would bloat Phase 2 and dilute focus.

### Why This Is Higher Priority Than Caching (Phase 4)
All token savings from Phase 1 and Phase 2 are partially negated if a student wastes 5 of 12 turns chatting. Example:
- Phase 2 gives us ~12 turns per session
- Student sends 5 drift turns → ~7 actual learning turns
- We've saved tokens technically but delivered same poor learning experience
- Phase 3 PROTECTS the gains of Phase 2

### The Core Loophole
Students (or deliberate exploiters) can send casual chat repeatedly. The system currently:
1. Classifies as GREETING or OUT_OF_CONTEXT
2. Runs full decider + tutor pipeline (~1,500-2,000 tokens/turn)
3. Returns a warm but useless (for learning) response
4. Repeats indefinitely

There is no session-level memory of how many times this happened. Every turn is treated identically.

### Total Estimated Effort: 4-6 hours across 2 sessions

---

### Layer 3.1 — Consecutive Non-Academic Turn Counter

#### Step 3.1.1 — Add counter fields to session schema

**What:**
Add two fields to the `ChatSession` Mongoose schema:
- `consecutiveNonAcademicTurns` — resets to 0 on any academic turn. Used for tier escalation.
- `totalNonAcademicTurns` — never resets. Used for hard cap and monitoring.

**Why:**
Without these counters, every turn is stateless from a drift perspective. The system has no way to know "this is the 6th off-topic message in a row."

**Where:**
- [backend/src/models/chatSession.model.js](backend/src/models/chatSession.model.js) — add fields to schema
- [backend/src/ask/step2.loadSession.js](backend/src/ask/step2.loadSession.js) — no change needed (Mongoose reads new fields automatically with defaults)
- [backend/src/ask/step3.buildContext.js](backend/src/ask/step3.buildContext.js) — expose in returned context object

**How:**
```js
// chatSession.model.js — add to schema:
consecutiveNonAcademicTurns: { type: Number, default: 0 },
totalNonAcademicTurns:       { type: Number, default: 0 },
```

In step3.buildContext.js, expose in returned context:
```js
driftSignal: {
  consecutiveNonAcademic: session.consecutiveNonAcademicTurns ?? 0,
  totalNonAcademic:        session.totalNonAcademicTurns       ?? 0,
}
```

**Edge cases:**
- Existing sessions in MongoDB: don't have these fields → `?? 0` fallback handles it cleanly.
- CHOOSE_COURSE intent: student is choosing what to study = IS academic engagement → reset consecutive counter.
- UNSAFE_OR_ABUSIVE: NOT academic, but don't increment non-academic counter either — abuse is a separate concern, handled separately.

**Hidden risks:**
- Schema migration: Mongoose default handles it automatically. No migration script needed.
- If step7 crashes before saving: counter not updated for that turn. Acceptable — one missed increment is harmless.

**Test plan:**
1. Start new session → verify both fields are 0 in MongoDB
2. Send 3 GREETINGs → verify `consecutiveNonAcademicTurns` = 3, `totalNonAcademicTurns` = 3
3. Send a science question → verify `consecutiveNonAcademicTurns` resets to 0, `totalNonAcademicTurns` stays at 3
4. Send 2 more GREETINGs → verify consecutive = 2, total = 5

**Rollback:** Remove fields from schema. Mongoose ignores missing fields in existing documents. Remove from step3 context.

**Completion criteria:**
- Both fields in schema with correct defaults
- Fields visible in returned context object
- No regression in existing pipeline

**Token impact:** None.

---

#### Step 3.1.2 — Update counter in step7 after each turn

**What:**
After intent is known and response is saved, update both counters in the session document.

**Where:**
- [backend/src/ask/step7.saveAndRespond.js](backend/src/ask/step7.saveAndRespond.js) — after session save, add counter update

**How:**
```js
const ACADEMIC_INTENTS = new Set([
  'CONCEPT_QUESTION', 'EXPLAIN_MORE', 'NEXT_STEP', 'CHOOSE_COURSE'
]);
const isAcademic = ACADEMIC_INTENTS.has(decision.intent);

if (isAcademic) {
  await ChatSession.findByIdAndUpdate(session._id, {
    consecutiveNonAcademicTurns: 0,
  });
} else {
  await ChatSession.findByIdAndUpdate(session._id, {
    $inc: {
      consecutiveNonAcademicTurns: 1,
      totalNonAcademicTurns: 1,
    }
  });
}
```

**Edge cases:**
- UNSAFE intent: `$inc` will run (not in ACADEMIC_INTENTS). This is correct — abusive messages should count toward total non-academic.
- Multiple rapid requests (unlikely but possible in tests): MongoDB atomic `$inc` handles concurrency correctly.
- If counter update fails (DB error): log warning, do NOT fail the main request. Counter accuracy is a nice-to-have, not critical path.

**Hidden risks:**
- This adds one extra DB write per turn. Acceptable — same collection, same document, lightweight operation.

**Test plan:**
1. Send GREETING → DB: consecutive = 1, total = 1
2. Send CONCEPT_QUESTION → DB: consecutive = 0, total = 1
3. Send 5 GREETINGs → DB: consecutive = 5, total = 6

**Rollback:** Remove the counter update block from step7.

**Completion criteria:**
- Counters update correctly in MongoDB after each turn
- Academic turns reset consecutive, increment nothing
- Non-academic turns increment both

**Token impact:** None.

---

### Layer 3.2 — Progressive Redirect Enforcement

#### Step 3.2.1 — Define 3 drift tiers + inject into GREETING prompt context

**What:**
Based on `consecutiveNonAcademicTurns`, compute a "drift tier" and inject an escalating redirect instruction into the GREETING/conversation prompt.

```
Tier 0 (consecutive 0-1): Normal response — friendly, brief, ask what to study
Tier 1 (consecutive 2-3): Gentle nudge — "Kuch padhna hai? Main ready hun!"
Tier 2 (consecutive 4+):  Firm redirect — very short response, no engagement, hard redirect
```

**Why:**
One casual message deserves warmth. Five in a row deserves firmness. A flat response regardless of drift count rewards avoidance behavior.

**Where:**
- [backend/src/ask/step3.buildContext.js](backend/src/ask/step3.buildContext.js) — add `getDriftTier()` helper, expose tier in driftSignal
- [backend/src/ask/step6.generateResponse.js](backend/src/ask/step6.generateResponse.js) — pass tier instruction into GREETING prompt invocation
- This integrates with Phase 2.3.2 (greetingPrompt.js) — that prompt must accept a `{driftInstruction}` variable

**How:**
```js
// step3.buildContext.js
const getDriftTier = (n) => {
  if (n <= 1) return 0;
  if (n <= 3) return 1;
  return 2;
};

// In context:
driftSignal: {
  consecutiveNonAcademic: session.consecutiveNonAcademicTurns ?? 0,
  totalNonAcademic:       session.totalNonAcademicTurns       ?? 0,
  tier: getDriftTier(session.consecutiveNonAcademicTurns ?? 0),
}
```

```js
// step6.generateResponse.js — GREETING invocation
const DRIFT_INSTRUCTIONS = {
  0: '',
  1: 'Student ne kai baar non-study messages bheje hain. Gently lekin clearly study ki taraf redirect karo.',
  2: 'Student studying avoid kar raha hai. BAHUT CHOTI response do (1-2 lines max). Off-topic content engage mat karo. Sirf science topic suggest karo.',
};
const driftInstruction = DRIFT_INSTRUCTIONS[context.driftSignal?.tier ?? 0];
```

**Edge cases:**
- Tier 2 with genuine emotional message ("exam ka bahut darr lag raha hai"): this IS relevant to studying. Handle by softening the Tier 2 instruction: "briefly acknowledge in one line, then redirect to the topic they're anxious about."
- Counter unavailable (step3 crash): default to tier 0 (safe — normal friendly response).

**Hidden risks:**
- Tier 2 feeling robotic or cold. Manual testing required — adjust instruction wording if feedback is negative.

**Test plan:**
1. Fresh session → send GREETING → warm normal response (Tier 0)
2. Send 3 consecutive off-topic messages → verify Tier 1 message is notably more redirect-focused
3. Send 5 consecutive → Tier 2 response should be very short (1-2 lines) and firm
4. Send science question → Tier resets → next GREETING is warm again

**Rollback:** Remove tier injection from step6. Remove getDriftTier from step3.

**Completion criteria:**
- 3 tiers produce noticeably different response styles
- Tier 2 responses are visibly shorter and more redirect-focused
- Tier resets correctly after any academic turn

**Token impact:** Tier 2 saves ~200-400 tokens/turn (shorter response = less output tokens).

---

#### Step 3.2.2 — Hard session-level non-academic turn cap

**What:**
A hard limit: once `totalNonAcademicTurns` reaches `MAX_NON_ACADEMIC_TURNS` (env-configurable, default 10), non-academic turns are short-circuited. No tutor LLM call. Returns a fixed redirect message.

**Why:**
Progressive redirect is gentle and can be ignored by a determined student. The hard cap is the final defense — it removes the loophole entirely. After 10 off-topic turns, the token cost of continued engagement is not justified.

**Where:**
- [backend/src/ask/askOrchestrator.js](backend/src/ask/askOrchestrator.js) — add cap check after decider, before step6
- [backend/src/config/env.js](backend/src/config/env.js) — add `MAX_NON_ACADEMIC_TURNS` env var

**How:**
```js
// askOrchestrator.js — after step4 (decider), before step6 (tutor):
const MAX_NON_ACADEMIC = parseInt(process.env.MAX_NON_ACADEMIC_TURNS ?? '10', 10);
const NON_ACADEMIC_INTENTS = new Set(['GREETING', 'OUT_OF_CONTEXT']);

if (
  NON_ACADEMIC_INTENTS.has(decision.intent) &&
  context.driftSignal.totalNonAcademic >= MAX_NON_ACADEMIC
) {
  console.warn(`[Drift Cap] Session ${session._id} hit non-academic cap (${MAX_NON_ACADEMIC}). Blocking.`);
  return res.json({
    status: 'answered',
    responseMode: 'conversation',
    title: null,
    sections: [{
      heading: null,
      content: 'Zuno sirf Science padhaane ke liye hai! Koi bhi Science topic choose karo aur hum shuru karte hain. 📚'
    }],
    sources: [],
    suggestedActions: [],
  });
}
```

**Edge cases:**
- Academic queries after cap: cap only blocks GREETING/OUT_OF_CONTEXT. A student who finally asks a science question always gets through. ✅
- UNSAFE after cap: UNSAFE_OR_ABUSIVE is not in `NON_ACADEMIC_INTENTS` — handled by its own path. ✅
- Cap value in .env.example: document `MAX_NON_ACADEMIC_TURNS=10` as a configurable tuning knob.
- Student creates new session to bypass cap: user-level tracking would require auth system (out of scope for MVP). Session-level cap is sufficient for now.

**Hidden risks:**
- Cap too low (e.g., 5): student might feel frustrated if they have a genuine emotional moment early. Start at 10, monitor.
- Edge case: student sends 10 non-academic messages, then sends a mixed message (academic + social). Embedding probe (Layer 2.2) would upgrade that to CONCEPT_QUESTION, bypassing the cap correctly. ✅

**Test plan:**
1. Set `MAX_NON_ACADEMIC_TURNS=3` in .env for testing
2. Send 3 non-academic messages → turn 4 non-academic should return cap message with NO tutor LLM call
3. Verify token logs: no `[TUTOR]` entry on capped turn
4. Send science question on turn 5 → works normally
5. Reset `MAX_NON_ACADEMIC_TURNS=10` for production

**Rollback:** Remove the cap check block from orchestrator. Counter still tracks harmlessly.

**Completion criteria:**
- Cap fires after `MAX_NON_ACADEMIC_TURNS` non-academic turns
- Academic queries NEVER blocked by cap
- Zero TUTOR LLM call on capped turns (verified in token logs)
- `MAX_NON_ACADEMIC_TURNS` readable from env with default 10

**Token impact:** When cap fires: saves ~1,500-2,000 tokens per blocked turn (entire tutor call avoided).

---

### Layer 3.3 — Monitoring & Visibility

#### Step 3.3.1 — Log drift signal in turn summary

**What:**
Add drift tier and consecutive count to the existing token audit log box in `logTurnSummary`.

**Where:**
- [backend/src/utils/tokenLogger.js](backend/src/utils/tokenLogger.js) — `logTurnSummary` function

**How:**
```js
// In logTurnSummary, add conditional drift line:
if (driftSignal?.tier > 0) {
  console.log(
    `  ⚠️  DRIFT  tier:${driftSignal.tier}  consecutive:${driftSignal.consecutiveNonAcademic}  total:${driftSignal.totalNonAcademic}`
  );
}
```

**Edge cases:** None — purely additive logging, fires only when tier > 0.

**Test plan:** Send 4 drift turns, verify tier escalation visible in logs.

**Completion criteria:** Drift signal visible in logs when non-zero. Zero noise on normal academic turns.

**Token impact:** None.

---

#### Step 3.3.2 — Add drift stats to per-intent aggregates

**What:**
In `logIntentAggregates`, add a footer line showing total drift turns seen across the tracked window.

**Where:**
- [backend/src/utils/tokenLogger.js](backend/src/utils/tokenLogger.js) — `logIntentAggregates` function

**How:**
Track `totalDriftTurns` (any GREETING/OUT_OF_CONTEXT) in the existing `intentStats` map. Print at aggregate log time:
```
[DRIFT SUMMARY] Non-academic turns: 12 / 47 total (25%) | Cap triggers: 2
```

**Completion criteria:**
- Aggregate log shows drift percentage
- Cap trigger count visible
- Allows post-session analysis of drift rate

**Token impact:** None.

---

### Phase 3 Exit Criteria
Before declaring Phase 3 complete:
- [ ] `consecutiveNonAcademicTurns` and `totalNonAcademicTurns` tracked correctly in MongoDB
- [ ] Tier 0/1/2 redirect behavior verified in manual testing (5 turns each tier)
- [ ] Hard cap fires correctly, academic queries NEVER blocked
- [ ] Zero TUTOR LLM call on capped turns (verified in token logs)
- [ ] Drift signal visible in token audit logs
- [ ] `MAX_NON_ACADEMIC_TURNS` configurable via env var (default 10)
- [ ] No regression on golden test set (all academic queries still pass)

**Estimated savings from Phase 3:** 2,000-8,000 tokens per session (2-5 drift turns prevented × ~1,500 tokens each). More importantly: effective learning turns protected.

---

## 10. Phase 4 — Caching Probe (Conditional)

### Phase Goal
If Phase 0.3 confirmed caching works on Groq, enable it. Otherwise abandon this phase.

### Layer 4.1 — Provider Capability Check

#### Step 4.1.1 — Send 5 identical Groq API calls, inspect for `cache_read_input_tokens` field
> Deep-dive when reached. Already partially done in Phase 0.3.

#### Step 4.1.2 — Document finding
- If found: detail TTL, hit rate, savings → proceed to Layer 4.2
- If not: document in Open Decisions Log, abandon

### Layer 4.2 — Enable Caching
> Deep-dive when reached. Conditional on 4.1.

---

## 11. Phase 5 — History Compression (Only If Needed)

### Decision Gate (Step 5.1.1)
After Phase 2+3+4 stable, measure: is avg session turn count ≥12 at 30k window? If yes, **SKIP Phase 5 entirely.** Don't optimize past requirement.

If no, proceed with Layer 5.2.

> Detailed steps deferred until decision gate evaluated.

---

## 12. Cross-Cutting Concerns

### Testing Rubric (applies to all phases)
Every change must pass:
1. **Functional test** — does the endpoint still respond?
2. **Unit test** — for new helpers (academic regex, formatter changes, etc.)
3. **Integration test** — golden set runs cleanly
4. **Token measurement** — aggregated logs show expected reduction
5. **Manual smoke** — 5 real queries by developer

### Rollback Strategy
| Phase | Rollback granularity |
|-------|----------------------|
| Phase 0 | Per-step (each is additive — remove call sites) |
| Phase 1 | Per-step (each is a one-file revert) |
| Phase 2 | Feature flag toggle OR full revert of intent router code |
| Phase 3 | Disable caching flag |
| Phase 4 | Switch history format back |

### Feature Flag Approach (Phase 2 specifically)
- `env.useIntentRouter: boolean` (default false initially, true after validation)
- step6 checks flag, dispatches to either intent router OR monolithic tutor
- Monolithic code path stays alive 2 weeks post-Phase-2 launch as safety
- After 2 weeks stable, delete dead code

### Code Quality Standards
- New files: ESM modules, JSDoc on exports
- Per-intent prompts: shared persona partial enforced via unit test
- No new npm dependencies without justification
- All changes must pass existing test scripts: `test:chunks`, `test:study-map`, `test:vector-store`, `test:chat-db-models`

### What NOT to touch (out of scope)
- RAG reranker logic ([backend/src/rag/reranker.js](backend/src/rag/reranker.js)) — separate concern, regression risk
- Embeddings pipeline ([backend/src/rag/indexPipeline.js](backend/src/rag/indexPipeline.js)) — would require re-indexing
- Tutor persona/tone — only structural prompt changes, not personality changes
- Frontend (`frontend/`) — entire token problem is backend-side
- MongoDB schemas (except minor field additions if required) — keep stable
- Session/chat history models — these work, leave alone

---

## 13. Open Decisions Log

Use this section to capture decisions made mid-implementation that future sessions need to know about.

| Date | Decision | Reasoning | Outcome |
|------|----------|-----------|---------|
| 2026-06-17 | Plan structure: Phase → Layer → Small Step | Multi-session continuity | This file |
| 2026-06-17 | Don't switch LLM provider just for caching | Provider switches need their own analysis | Phase 3 limited to Groq probe |
| 2026-06-17 | Keep monolithic prompt alive 2 weeks post-Phase-2 | Safety net | Cleanup in Layer 2.6 |
| 2026-06-17 | Static prompt cost was underestimated | Plan said ~2,600 tokens/turn. Actual measured: Decider ~1,336 + Tutor ~2,502 = ~3,838 tokens/turn static cost. Raises per-turn baseline. Phase 2 savings even more critical. | Confirmed via Step 0.1.1 |
| 2026-06-17 | Layer 0.3 revised: Groq-specific probe → provider-agnostic detection | System uses 3 providers (Groq/OpenAI/Gemini) switchable via env var, hybrid planned. Hardcoding Groq field breaks on provider switch. OpenAI auto-caches prompts >1024 tokens — may already be active. | Layer 0.3 rewritten, Phase 3 scope updated |
| 2026-06-17 | Gemini 2.5-flash truncation fix | thinkingBudget:0 added to chatModel.js Google provider. Thinking tokens were consuming maxOutputTokens budget, truncating JSON mid-generation. Also increased DECIDER maxTokens 250→350, TUTOR 1200→1500. jsonParser.js also hardened with global fence stripping + balanced brace finder. | Fixed in chatModel.js, step4, step6, jsonParser.js |
| 2026-06-17 | Phase 0.3 — Gemini caching: inactive | No `cached:` field in any Gemini 2.5-flash response. Auto-caching not available on this model/provider. Phase 3 will be tested when OpenAI provider is used. | Phase 3 fate pending OpenAI test |
| 2026-06-17 | Phase 2.0 baseline captured — 80% intent accuracy (32/40) | GREETING/CONCEPT/EXPLAIN_MORE/CHOOSE_COURSE/UNSAFE all 100%. OUT_OF_CONTEXT 60% (Maths/History confused with Science). NEXT_STEP 0% (rate-limited, not tested). BLIND_SPOT 60% (pronoun+mixed queries weak). Baseline saved: backend/test/golden-baseline-phase1.json | Phase 2.1 decider redesign must fix OUT_OF_CONTEXT + BLIND_SPOT edges |
| 2026-06-17 | Step 2.1.1+2.1.2 complete — lean decider prompt live | New prompt: ~578 tokens (vs ~1,336 before) = ~758 tokens saved/turn on decider. All 4 intent tests passed. Blind spot test passed (greeting+science → CONCEPT_QUESTION). needsRetrieval made fully deterministic in normalizeDecision (no LLM dependency). OUT_OF_CONTEXT definition updated to include other Class 10 subjects (Maths, Hindi, etc.) as "currently unavailable" not "out of scope". Conservative bias rule working. | deciderPrompt.js + step4 line 83 updated |
| 2026-06-17 | Step 2.1.3 — Per-call model config implemented | Groq 429 rate limit issue on llama-3.3-70b-versatile made single-provider setup unreliable. Added DECIDER_PROVIDER/DECIDER_MODEL env vars + getDeciderConfig() in llm.config.js. Decider now runs on Groq llama-3.1-8b-instant (free tier, high rate limits), Tutor on OpenAI gpt-4o-mini. GREETING turn dropped from ~5,500 to 3,494 tokens (~36% reduction). Falls back to global LLM_PROVIDER if DECIDER_PROVIDER not set. | llm.config.js + step4.decideRetrieval.js updated |
| 2026-06-18 | Step 2.1.5 — 8B model PASSED gate at 97.2% effective accuracy | 6/7 categories 100%. NEXT_STEP 0% is Groq rate limit during rapid test execution, not model failure (production pacing prevents this). BS05 "Physics padhna hai + electricity samjhao" stubborn edge case — CHOOSE_COURSE instead of CONCEPT_QUESTION. Accepted: Layer 2.2 safety net will catch academic keywords. Keeping llama-3.1-8b-instant on Groq for decider. | Layer 2.1 complete |
| 2026-06-18 | Step 2.2 complete — embedding similarity probe replaces keyword regex | Keyword approach rejected (fragile, language-blind, not scalable). Embedding probe: probeAcademicSimilarity() in intentSafetyNet.js — top-1 vector similarity, fail-open, threshold via SAFETY_NET_SIMILARITY_THRESHOLD env var (default 0.65). Devanagari step removed — Gemini multilingual embeddings handle all languages natively. Override fires in askOrchestrator.js between step4 and step5. Logging: override_rate% per intent in aggregates, [SAFETY-NET] tag in turn summary. | Layer 2.2 done |
| 2026-06-18 | Phase 3 added — Session Integrity Guard | Farhan identified that keyword-based guard (Layer 2.2 original plan) was fragile AND that the system has no defense against deliberate conversational drift (user chatting to waste tokens). Keyword approach rejected. Embedding similarity probe adopted for guard (language-agnostic, future-proof). Conversational drift elevated to its own Phase 3 (high priority) with session counter + progressive redirect + hard cap. Phases renumbered: old Phase 3 (Caching) → Phase 4, old Phase 4 (History) → Phase 5. | Phase 3 now jumps immediately after Phase 2 |
| 2026-06-18 | Step 2.5.4 skipped — "48 hr production soak" not applicable | App is not deployed. No real users exist. Production soak is a post-deployment concern. Will revisit after Stage 12 deployment. | Step 2.5.4 marked [~] skipped, Layer 2.5 declared complete |
| 2026-06-18 | Layer 2.6 deferred to post-deployment | Cleanup (delete monolithic path + remove flag) is safe to defer. Current state: flag=true, legacy path alive. No harm in keeping both paths until app is deployed and stable. | Layer 2.6 marked [~] deferred |
| 2026-06-18 | Phase 2 complete — moving to Phase 3 next session | Intent router live and tested (4 rounds). Layer 2.5 done. Layer 2.6 deferred. Phase 3 (Session Integrity Guard) is next priority. | Next session starts at Phase 3, Layer 3.1, Step 3.1.1 |
| _PENDING_ | Phase 5 decision gate — needed or skip? | TBD after Phase 2+3+4 stable | Affects whether project ends at Phase 3 or continues |
| 2026-06-18 | C10: memoryUpdate protection — Option B chosen, Option C deferred to Phase 6 | **Option B (chosen):** Per-intent whitelist in `sanitizeMemoryUpdate()`. ~15 lines in step7. GREETING/REDIRECT/UNSAFE → whitelist=[]. Others → intent-specific allowed fields. Existing EXPLAIN_MORE guard (step7:127-130) is exactly this pattern — we're making it systematic. **Option C (deferred):** Remove memoryUpdate from ALL prompts entirely. State managed code-side only: lastTopic from response.title, currentTopicId from nextTopicSignal, etc. More reliable (zero LLM hallucination on state), saves ~50 tokens/turn (memoryUpdate JSON block removed from prompts). Deferred because it requires redesigning step6→step7 data flow — over-engineering for current phase. **Trigger to migrate to C:** Option B whitelist becomes hard to maintain OR token pressure returns after Phase 2+3+4+5. See Phase 6. | Step 2.4.5 |

---

## 14. How To Use This File (Session Protocol)

This file is designed for **multi-session work**. Each session, follow this protocol exactly:

### At Session Start

1. **Read sections 0-4** in full. This restores context.
2. **Read Section 5 (Status Tracker)**. Identify the next incomplete step (first `[ ]` you find, top-to-bottom).
3. **Read that step's full detail** in the relevant Phase section. Note: edge cases, hidden risks, completion criteria.
4. **Read Section 12 (Open Decisions Log)** for any decisions logged since the file was created.

### During The Session

1. **Discuss the step with the senior engineer (Claude)**:
   - What does it do?
   - What are the edge cases?
   - Are there any hidden concerns?
   - What's the exact implementation plan?
2. **The senior engineer must answer all your questions** before any code is written. If you don't understand something, ask. If the engineer is uncertain, they must say so.
3. **Implement the step**:
   - Make file changes
   - Run tests (the rubric in Section 11)
   - Validate completion criteria
4. **Mark the step done** in Section 5: change `[ ]` to `[x]`.
5. **If decisions were made**, log them in Section 12.

### At Session End

1. **Confirm Status Tracker is updated**.
2. **Commit the file changes** + the code changes together.
3. **Note for next session**: any blockers, anything that should be done next.

### Rules For The Senior Engineer (Claude)

When this file is loaded in a new session, Claude MUST:
- Treat the user as a junior developer learning the system
- Explain things at appropriate detail (no jargon dumps)
- Never skip steps in the order defined unless explicitly told
- Refuse to implement code without first discussing the step
- Stop implementation if a hidden risk surfaces — escalate to discussion
- When the user has no opinion on a sub-decision, make the senior call and explain reasoning
- Update this file as part of completing each step

### Rules For The User (Junior Developer)

- Don't skip ahead. Steps are ordered for safety.
- Don't combine multiple steps in one session unless they're trivially related.
- If a step seems "obvious," still discuss it — hidden risks often live in obvious steps.
- If the senior engineer suggests something not in this file, push back: "Why isn't this in the plan?"
- Mark steps done only after completion criteria are met.

### What To Do If You Get Stuck

- **Stuck on understanding**: ask the senior engineer to break it down further with examples
- **Stuck on implementation**: explain what you tried and what happened
- **Stuck on a decision**: list the options + tradeoffs, ask senior to recommend
- **Stuck on time**: stop, mark current step `[~]` in-progress with a note, resume next session

### When To Update This File

- After every step completion (update Status Tracker)
- When a decision is made (Open Decisions Log)
- When you discover something the plan didn't account for (add to relevant phase as a note, discuss with senior)
- When a step's detail proves wrong (correct it, log in decisions)

### When NOT To Update This File

- Don't add random thoughts/notes outside the structure
- Don't change Phase ordering without senior engineer approval
- Don't mark steps done without completion criteria met
- Don't remove sections — append, never delete

---

## 15. Phase 6 — Code-Side State Management (Future, Conditional)

> ⏳ **DO NOT START** until Phase 2+3+4+5 are stable AND the decision gate below passes.

### Decision Gate — START Phase 6 only if ONE of these is true:
1. Option B whitelist in `sanitizeMemoryUpdate()` is becoming hard to maintain (too many intents, frequent field changes)
2. Token pressure returns after Phase 2+3+4+5 and memoryUpdate JSON in prompts is a measurable cost
3. A production bug surfaces where LLM memoryUpdate corrupted session state despite Option B

If none of these are true — **skip Phase 6 entirely.**

---

### What is Phase 6 — The Core Idea

**Today (Option B):** LLM generates `memoryUpdate` JSON in every response → step7 reads it → writes to MongoDB. We protect it with a whitelist.

**Phase 6 (Option C):** Remove `memoryUpdate` from ALL intent prompts completely. State changes are computed **code-side** in step7, not by the LLM.

```
Intent prompt output (today):        Intent prompt output (Phase 6):
{                                     {
  "status": "answered",                 "status": "answered",
  "title": "Photosynthesis",            "title": "Photosynthesis",
  "sections": [...],                    "sections": [...],
  "suggestedActions": [...],            "suggestedActions": []
  "memoryUpdate": {              ←      // memoryUpdate GONE
    "lastTopic": "Photosynthesis",
    "learningMode": "lesson"
  }
}
```

Step7 derives state from what it already knows:
- `lastTopic` → from `response.title` (already computed in step6, no LLM guess needed)
- `currentTopicId` → from `nextTopicSignal` (already comes from step5, already done for NEXT_STEP)
- `learningMode` → from `intent` directly (CONCEPT → "lesson", GREETING → keep current, REDIRECT → keep current)
- GREETING/REDIRECT/UNSAFE → nothing changes (already whitelist=[] in Option B)

---

### Why Phase 6 Is Better Than Option B (Long Term)

| Aspect | Option B (current) | Phase 6 (future) |
|--------|-------------------|-----------------|
| Reliability | LLM + whitelist guard | Code only — guaranteed |
| Token cost | memoryUpdate JSON in every prompt | ~50 tokens saved/turn |
| Hallucination risk | Low (whitelist stops damage) | Zero |
| Auditability | Scattered across 7 prompt files | All in one place (step7) |
| Maintenance | Whitelist must stay in sync | No whitelist needed |

---

### The Hard Case — CHOOSE_COURSE

CHOOSE_COURSE is the only tricky intent. When a student says "Biology padhna hai", the LLM needs to tell us *which chapter was selected*. Today it returns this in memoryUpdate.

In Phase 6, memoryUpdate is gone. Options:
- **Option A:** Add a separate minimal `selection` field to CHOOSE_COURSE output only: `{ "chapterId": "bio_ch_01", "subjectId": "science" }` — not a full memoryUpdate, just the selection signal.
- **Option B:** Step4 decider already extracts intent. Step6 could derive chapter from the LLM's response title + curriculum lookup. More complex.

Recommended: Option A — minimal `selection` field for CHOOSE_COURSE only. Everything else removed.

---

### Estimated Effort: 8-10 hours, 1 dedicated session

### Files affected:
- All 7 intent prompt files — remove `memoryUpdate` from JSON schema
- `step7.saveAndRespond.js` — replace `sanitizeMemoryUpdate()` with code-side state derivation
- `step6.generateResponse.js` — pass `intent` + `response.title` to step7 explicitly
- `chatSession.model.js` — no changes needed

---

## End Of Plan

**Total scope:** ~60 small steps across 5 phases.
**Estimated total effort:** 25-30 hours across 10-14 sessions.
**Target outcome:** Per-turn cost from ~5,500 tokens to ~2,500 tokens. Session turn count from ~5 to ~12-15. Session integrity protected from drift exploitation.

**This file is the single source of truth. Trust it. Update it.**
