# GLOBAL MODE — VERIFICATION CHECKLIST (Read-Only Audit)

**Status:** Draft v2 — first pass done, then re-audited to catch missed items and fix assumptions.
**Date:** 2026-07-24
**Branch:** `global`
**Method:** Code-verified, file:line references. No LLM behaviour claims made without pointing at the exact prompt/code path that would produce them. Every claim was re-checked in the v2 pass; changes flagged as **[v2 correction]** or **[v2 new]** below.

---

## How this doc is organized

- **Sections A–G** — group related findings by area of the system.
- **Each finding** — has a stable ID (e.g. `A1`), a one-line summary, evidence (file+line), and a risk tag.
- **Risk tags:**
  - 🟢 **Low** — cosmetic / polish / design intent, no observed harm.
  - 🟡 **Medium** — real gap or edge-case bug, narrow trigger or graceful degradation.
  - 🔴 **High** — reproducible bug, or a state-corruption path a normal user flow can hit.
- **Nothing here is fixed yet.** This file's only job is to catalog risks so they can be discussed and prioritized before touching shared code.

## What was inspected

Full trace of the 7-step Ask pipeline + `intentRouter.js` + relevant prompts + frontend `ChatPage.jsx` / `AskBar.jsx` / `ChatMessage.jsx` — following every `studyMode === 'global'` / `!focusChapter` branch. Confirmed live path is `USE_INTENT_ROUTER=true` (backend/.env). Reranker keyword-substring bug (fixed on 2026-07-24 in the sibling `fix/cross-chapter-retrieval` branch, already merged) is out of scope here.

**Second-pass verification** (v2, same day): re-read every claim's evidence. Explicitly traced all UI entry points that set `studyMode: 'global'` or `studyMode: 'focus'`, and inspected every write path to `sessionType`. Corrections applied inline below.

---

## SECTION A — Session lifecycle & mode transitions

### A1 🟡 `chatState.lastTopic` / `lastDoubtTopic` / `lastDoubtQuestion` are NOT cleared on global-mode turns

**Evidence:** [step7.saveAndRespond.js:252-256](backend/src/ask/step7.saveAndRespond.js#L252) only nulls `learningMode`, `currentSubjectId`, `currentSectionId`, `currentChapterId` for global-mode turns. `lastTopic` / `lastDoubtTopic` / `lastDoubtQuestion` are untouched. Symmetric read in [step2.loadSession.js:102-108](backend/src/ask/step2.loadSession.js#L102) also only touches those same 4 fields.

**What could happen:** If a session was used in focus mode (any turn set `chatState.lastTopic = 'Reflection of Light'`) and then the student switches to global (see A2 for how), `lastTopic` still points at the focus-mode topic.

**[v2 correction]** Re-checked what actually consumes `lastTopic`:
- [step3.buildContext.js:36-40](backend/src/ask/step3.buildContext.js#L36) — `buildSemanticStudyContext` early-returns when `!chatState.currentChapterId`, so **`lastTopic` is NOT injected into the decider or tutor prompt** in a global-mode turn (the chapter fields are wiped, so it can never reach the "active topic" line).
- BUT: [promptHelpers.js:108](backend/src/ask/promptHelpers.js#L108) — `formatMemoryForPrompt` still includes `lastTopic` in the serialized memory JSON that goes to the tutor. So stale `lastTopic` IS visible to the LLM through the memory blob, just not through the semantic-context line.
- Also: [step7.saveAndRespond.js:173](backend/src/ask/step7.saveAndRespond.js#L173) — `buildSessionPayload` returns `lastTopic` in the frontend session payload. In a corrupted-state session (see A2), the frontend can see stale `lastTopic` even though there's no chapter.

**Why medium:** it's the same "orphan state field" pattern that motivated Focus Mode's BUG-1 fix (removing redundant progress fields from `chatState`). No user-observable harm confirmed, but the shape is identical to a previously-real class of bug.

### A2 🔴 `sessionType` is immutable but `studyMode` is per-request — cross-mode divergence is real (**BIDIRECTIONAL** [v2])

**Evidence:**
- `sessionType` is set once via `$setOnInsert` — [chatSession.service.js:88](backend/src/services/chatSession.service.js#L88) with explicit comment *"immutable — only applied on document creation"*. Confirmed no code path anywhere writes `sessionType` outside `$setOnInsert` (grep verified).
- `studyMode` is read fresh from every `/ask` request body — [step1.validateInput.js:28](backend/src/ask/step1.validateInput.js#L28).
- No cross-check anywhere between the request's `studyMode` and the DB session's `sessionType`.

**[v2 new] Direction 1 — focus → global** (reproducible):
- [ChatPage.jsx:364-368](frontend/src/pages/ChatPage.jsx#L364) — `handleClearFocus` sets `studyMode: 'global'`, does NOT clear `sessionId`.
- Reachable UI entry points (both real, both send the same-session `/ask` with `studyMode: 'global'`):
  1. `global_mode` chip on CHAPTER_COMPLETE response — [intentRouter.js:196](backend/src/ask/intentRouter.js#L196)
  2. `global_mode` chip on out-of-focus redirect response — [intentRouter.js:214](backend/src/ask/intentRouter.js#L214)
- On the next `/ask`, [step7.saveAndRespond.js:252-256](backend/src/ask/step7.saveAndRespond.js#L252) nulls the chapter fields. DB session ends up with `sessionType: 'focus'` and `currentChapterId: null`.

**[v2 new] Direction 2 — global → focus** (partially guarded, but not fully):
- [ChatPage.jsx:296-317](frontend/src/pages/ChatPage.jsx#L296) — `handleFocusChapterSelect` sets `studyMode: 'focus'`.
- **Partial guard**: line 301-303 — `if (messages.length > 0) { clearSessionId(); setSessionId(''); }`. So if the session already has messages, it correctly starts a fresh session and no corruption occurs.
- **Where it leaks**: if a global session has NO messages yet (right after `handleNewChat`, or on an initial load before the first ask) but `sessionId` in state holds a stale value from `localStorage`, the guard doesn't fire and the focus turn is sent with that stale sessionId. Then [step7.saveAndRespond.js:257-263](backend/src/ask/step7.saveAndRespond.js#L257) populates chapter fields but `sessionType` (already 'global') is not overwritten. Result: `sessionType: 'global'` in DB with populated chapter state.
- **Worse consequence than direction 1**: [step7.saveAndRespond.js:308](backend/src/ask/step7.saveAndRespond.js#L308) writes to `ChapterProgress` only `if (studyMode === 'focus' && chatState.currentChapterId)` — so ChapterProgress DOES get real data. But [session.controller.js:112](backend/src/controllers/session.controller.js#L112) reads it only `if (currentChapterId && session.sessionType === 'focus')` — so on session restore, that ChapterProgress data is orphaned/invisible.
- **Frontend session-restore**: [ChatPage.jsx:225-227](frontend/src/pages/ChatPage.jsx#L225) sets focus mode ONLY when `sessionType === 'focus' AND meta.currentChapterId`. A `sessionType: 'global'` session with chapter data restores as global mode → chapter selection silently lost even though the underlying ChapterProgress row still exists.

**Why high:** normal-user-reachable via direct clicks (both directions). Silent. Produces self-inconsistent DB rows.

### A3 🟢 No UI indicator for "you are in Global Mode"

**Evidence:** [ChatPage.jsx:756](frontend/src/pages/ChatPage.jsx#L756) — `<FocusProgressHeader/>` only renders when `studyMode === 'focus'`. Global mode has no equivalent header/badge. `AskBar.jsx:103-107` differentiates only through the placeholder text.

**Why low:** polish / discoverability issue, no functional harm.

### A4 🟢 Drift-cap message text implies focus mode

**Evidence:** [askOrchestrator.js:128](backend/src/ask/askOrchestrator.js#L128) — cap message reads *"Zuno sirf Science padhaane ke liye hai! Koi bhi topic chunao — Physics, Chemistry, ya Biology — aur hum shuru karte hain."* — "topic chunao" is subject-selection phrasing. Fires in both modes but reads as focus-mode advice.

**Why low:** copy issue only, message still redirects correctly.

---

## SECTION B — Intent classification & routing (mode-blindness)

### B1 🟡 Decider has no mode awareness — `NEXT_STEP` classification fires in global mode too

**Evidence:**
- [deciderPrompt.js](backend/src/prompts/deciderPrompt.js) accepts only `{message}`, `{detectedLanguage}`, `{history}` (line 148-156). Nothing about `studyMode` or `focusChapter`.
- [step4.decideRetrieval.js:154](backend/src/ask/step4.decideRetrieval.js#L154) — the decider chain input never includes mode.
- Decider `NEXT_STEP` examples (line 17): *"Aage badhao", "Next topic", "Agla concept", "Chalo aage"* — none mention needing a chapter.

**What happens in global mode:** Student says "aage badho" with no chapter selected → decider returns `NEXT_STEP` → [step5.retrieveContent.js:47](backend/src/ask/step5.retrieveContent.js#L47) calls `getNextTopic(null, null)` → [nextTopicResolver.js:26-28](backend/src/curriculum/nextTopicResolver.js#L26) returns `{ status: 'no_chapter' }` → step5 returns `retrievedContext: 'NO_RETRIEVED_CONTEXT'` → the NEXT_STEP prompt handles this at [nextStepPrompt.js:43-46](backend/src/prompts/intents/nextStepPrompt.js#L43): *"Respond: 'Abhi koi agla topic nahi mila. Chapter summary dekha jaye ya koi specific topic poochho?'"*

**[v2 clarification]** The response gets status `needs_clarification` (per prompt line 46). No `next_topic` chip is injected (sanitizeSuggestedActions requires `nextTopicSignal` truthy, which is null here). So the student gets a plain "clarification" message with no click affordance.

**Why medium:** the response text says *"Chapter summary dekha jaye"* — but in global mode there IS no chapter. Student sees advice that doesn't apply to their state. Prompt was written under the implicit assumption that NEXT_STEP only fires in focus mode. Won't crash, but reads wrong.

### B2 🟡 `nextStepPrompt.js` is written assuming a chapter is always active

**Evidence:** [nextStepPrompt.js:23-26](backend/src/prompts/intents/nextStepPrompt.js#L23) — *"The student wants to move to the next topic. The retrieved context below contains that topic's content. Your job: teach this content naturally as a fresh lesson."* — the "this content" language implies content will always be present. The NO_RETRIEVED_CONTEXT branch at line 43-46 is a bolted-on defensive case with focus-only phrasing.

**Why medium:** same root cause as B1. Same shape of fix.

### B3 🟢 `chooseCoursePrompt`, `explainMorePrompt`, `examInfoPrompt` are mode-independent

**Evidence:** [intentRouter.js:139-149](backend/src/ask/intentRouter.js#L139) — none of these prompts get `focusChapter` in their input. CHOOSE_COURSE uses `curriculumSummary`, EXAM_INFO uses `retrievedContext` (from knowledge service, mode-agnostic), EXPLAIN_MORE uses `retrievedContext` + history.

**Why low:** these intents genuinely don't need mode awareness. Documenting so it isn't "fixed" unnecessarily.

---

## SECTION C — Retrieval in global mode

### C1 🟢 Global retrieval intentionally uses no chapter filter — pulls from all indexed content

**Evidence:** [step5.retrieveContent.js:17-26](backend/src/ask/step5.retrieveContent.js#L17) — `getRetrieverOptions(null)` returns `{}`, so `metadataFilter` is undefined and the Atlas vectorSearch runs across all 629 chunks.

**Why low:** correct by design — global mode is defined as "search everything."

### C2 🟡 Out-of-focus safety net is FOCUS-ONLY — global mode has fewer quality gates

**Evidence:** [step5.retrieveContent.js:203-210](backend/src/ask/step5.retrieveContent.js#L203) — the whole OUT-OF-FOCUS fallback + weak-match check is guarded by `intent === 'CONCEPT_QUESTION' && focusChapter && (...)`. In global mode, `focusChapter` is null → this entire branch never runs.

**[v2 new — important addition]:** Global retrieval is **materially less strict than focus retrieval**, not just missing the OOF branch:
- [step5.retrieveContent.js:17-26](backend/src/ask/step5.retrieveContent.js#L17) — `getRetrieverOptions(null)` returns `{}` (empty). It does NOT set `requireTermMatchForLatinQuery: true` (only the focus branch does, line 24).
- [retriever.js:68-85](backend/src/rag/retriever.js#L68) — `passesFinalFilter` — the term-match gate is guarded by `options.requireTermMatchForLatinQuery`. When missing (undefined), the whole term-match check is skipped, meaning Latin-script queries without keyword matches can pass through in global mode where they'd be filtered out in focus.
- **Net effect:** the exact substring-match / weak-match class of bug we fixed on 2026-07-24 in focus mode is more likely (not less) to surface in global mode's retrieval. It just wouldn't manifest as "cross-chapter leak" — it would manifest as "confidently-worded answer from a weakly-matched chunk."

**Why medium (not low):** structural gap, not confirmed defect (I haven't reproduced a bad answer in global mode yet). But given the retrieval is LESS strict, the risk is real. Would upgrade if a reproduction lands.

### C3 🟡 `chatState.lastRetrievalQuery` can bleed from focus → global via EXPLAIN_MORE

**Evidence:**
- [step7.saveAndRespond.js:220-227](backend/src/ask/step7.saveAndRespond.js#L220) — `lastRetrievalQuery` is written on `CONCEPT_QUESTION`/`NEXT_STEP` turns whenever `sources.length > 0 && !isOutOfFocusAnswer`. No mode gating.
- [step5.retrieveContent.js:114-129](backend/src/ask/step5.retrieveContent.js#L114) — EXPLAIN_MORE reuses `chatState.lastRetrievalQuery` as its retrieval query, and routes through `getRetrieverOptions(focusChapter)`. In a global-mode EXPLAIN_MORE, `focusChapter` is null → runs a global re-search of a saved query from a focus-mode turn.

**What could happen:** Session had a focus-mode CONCEPT_QUESTION about Reflection ("Reflection ka law kya hai?") — this got saved as `lastRetrievalQuery`. Student switches to global (per A2). Says "aur samjhao". Decider → EXPLAIN_MORE. Step5 re-retrieves "Reflection ka law kya hai?" globally, teaches from whatever comes back. Not necessarily wrong — Reflection is a real Light-chapter topic that would still match — but the source-of-truth chain is muddled: student never asked about Reflection in this new global-mode turn context.

**Why medium:** narrow trigger (requires focus→global transition per A2 first), and the wrong-outcome is subtle. Would benefit from clearing `lastRetrievalQuery` on studyMode change, symmetric to the chapter-fields clear at step7:252.

---

## SECTION D — Prompt design gaps for global mode

### D1 🟡 `conceptQuestionPrompt.js` is written assuming a focus chapter exists

**Evidence:** [conceptQuestionPrompt.js:59](backend/src/prompts/intents/conceptQuestionPrompt.js#L59) — *"Use the active focus chapter context to keep the answer relevant."* [Line 94](backend/src/prompts/intents/conceptQuestionPrompt.js#L94) — human template includes `Active focus chapter: {focusChapter}`. In global mode, [step3.buildContext.js:26-28](backend/src/ask/step3.buildContext.js#L26) substitutes the literal string `"No focus chapter selected."` there.

**[v2 clarification]** The insufficient-context fallback text (line 63-67) uses generic phrasing (*"our Class 10 Bihar Board Science indexed material"*) that reads correctly in BOTH modes. So the ambiguity is limited to line 59 (a soft instruction) and line 94 (a template slot). Empirically most modern models handle *"No focus chapter selected."* gracefully as "no chapter", but the prompt has no explicit branch or instruction for the no-chapter case.

**Why medium:** works in practice most of the time; is a fragility, not a defect. Would be strictly clearer to either have a `{focusChapter}` value like `"— (Global Mode: no chapter selected)"` or one prompt line acknowledging that state.

### D2 🟢 There is no separate `globalConceptPrompt` — one prompt serves both modes

**Evidence:** [intentRouter.js:145-146](backend/src/ask/intentRouter.js#L145) — same `conceptQuestionPrompt` for both.

**Why low:** design decision, not a bug. Mentioned so a well-meaning future refactor doesn't split them without a real reason.

---

## SECTION E — State persistence & session-mode integrity

*(E1/E2 are the same root cause as A2 — grouped separately for cross-referencing. If A2 is addressed, these dissolve.)*

### E1 🔴 Cross-mode transitions inside a single session silently corrupt DB state

**Evidence:** Same as A2. Both directions confirmed reachable via UI (see A2 for full walkthroughs).

**Why high:** normal-user-reachable; silent; produces self-inconsistent DB rows.

### E2 🟡 `session.controller.js`'s sessionMeta assumes clean sessionType invariants

**Evidence:** [session.controller.js:112](backend/src/controllers/session.controller.js#L112) — `if (currentChapterId && session.sessionType === 'focus')` — degrades cleanly to nulls if either is missing. No error. But downstream frontend can't tell the difference between "clean global session" and "corrupted focus session viewed post-transition" or "corrupted global session with orphan ChapterProgress data."

**Why medium:** graceful degradation but info-loss. Downstream of E1.

---

## SECTION F — Frontend flow

### F1 🟡 `handleClearFocus` reuses the existing session

**Evidence:** [ChatPage.jsx:364-368](frontend/src/pages/ChatPage.jsx#L364) — sets local mode + clears chapter selection. Does not clear `sessionId` or call `handleNewChat`. This is the frontend-side entry point for the A2 / E1 corruption path (focus → global direction).

**Why medium:** partly a design decision (letting the student "continue chatting freely" in the same conversation is arguably good UX), but combined with the backend accepting mode-mismatched turns, it becomes a corruption source. Fix belongs either here (start a new session on mode change) or at the backend (reject or normalize mode-mismatched turns).

### F2 🟡 Session-restore logic can silently downgrade sessionType to display mode

**Evidence:** [ChatPage.jsx:225-227](frontend/src/pages/ChatPage.jsx#L225) — only sets focus mode if BOTH `sessionType === 'focus'` AND `meta.currentChapterId` are truthy. Fails silently to global otherwise.

**Why medium:** downstream of E1. Same fix scope.

### F3 🟢 [v2 correction] `handleSwitchToGlobal` / "Search globally" button is dead code

**What v1 got wrong:** the first pass listed `handleSwitchToGlobal` as an entry point to the A2 corruption. Re-checked: it's wired via `onSwitchToGlobal` prop on `ChatMessage` ([ChatPage.jsx:844](frontend/src/pages/ChatPage.jsx#L844), [ChatMessage.jsx:222](frontend/src/components/ChatMessage.jsx#L222)), but the button only renders when `isFocusMiss` is true, and `isFocusMiss` checks `message.status === 'focus_context_not_found'` ([ChatMessage.jsx:133](frontend/src/components/ChatMessage.jsx#L133)).

**Verified via grep:** the string `focus_context_not_found` is NOT set anywhere in the backend response paths — only referenced in `ChatMessage.jsx`, this checklist's archived predecessor, and `PROBLEMS.md`. The actual out-of-focus response ([intentRouter.js:209-215](backend/src/ask/intentRouter.js#L209)) uses `status: 'answered'`, not `focus_context_not_found`. So the button is unreachable in current runtime behavior.

**Why low:** dead code, not a live risk. Noted here so it isn't re-flagged in future audits.

---

## SECTION G — Testing infrastructure

### G1 🟡 No automated verify script for Global Mode

**Evidence:** Only `backend/scripts/verify-focus-mode.js` exists. There is no `verify-global-mode.js` — no equivalent regression net for the global path.

**Why medium:** none of the fixes in this file can be safely worked on without one, since the shared 9-file pipeline means a global fix could silently break focus (and vice versa). We already have `verify-focus-mode.js` as the focus-side tripwire; a symmetric global-side script is the missing half.

### G2 🟢 `run-golden-set.js` is broken for both modes, not just global

**Evidence:** verified during 2026-07-24 fix session — script gets `data: {"to"...` (SSE format), can't parse. Documented separately. Not a global-mode-specific finding.

**Why low:** pre-existing, out of scope.

---

## Cross-cutting observations (not numbered findings)

- **Shared code paths**: every finding above touches at least one file also used by Focus Mode. This confirms the concern that motivated auditing this way — Global Mode is not a separate subsystem, it's a mode branch inside the same pipeline. Any fix must be tested against `verify-focus-mode.js` before/after (until `verify-global-mode.js` exists too, then both).
- **No global-only files exist** in `backend/src/`. Global is definitionally "everything except focus-specific branches."
- **`focusStudy` is the only study block in the study map** ([studyMap.service.js:126](backend/src/services/studyMap.service.js#L126)) — no `globalStudy` equivalent. This matches the "global is the default, not a special mode" implementation reality.
- **[v2 note] `sessionType` is truly immutable**: grep-verified that no code path outside `$setOnInsert` writes to it (only writes: chatSession.service.js:32 and :88, both inside `$setOnInsert` blocks). This is by design, but combined with the per-request `studyMode`, it's the root of E1's whole family of bugs.

---

## Findings summary — count by risk

| Risk | Count | IDs |
|---|---|---|
| 🔴 High | 2 | A2, E1 (same root cause) |
| 🟡 Medium | 9 | A1, B1, B2, C2, C3, D1, E2, F1, F2, G1 |
| 🟢 Low | 6 | A3, A4, B3, C1, D2, F3 (v2 correction), G2 |

**The two 🔴s are the same root cause manifesting in two places** — cross-mode session-state corruption, which the v2 pass confirmed is BIDIRECTIONAL (focus → global via `handleClearFocus`, global → focus via `handleFocusChapterSelect` when no messages yet). Address that one thing, and E1/A2/E2/F2 (and possibly B1/B2 too, if solved via a new-session-on-mode-change approach) all resolve together.

---

## v2 vs v1 diff — for the record

| ID | v1 → v2 change |
|---|---|
| A1 | Added clarification: `lastTopic` is NOT injected into the semantic-context line (early-return guard), but IS still in the memory JSON and session payload. |
| A2 | Added Direction 2 (global → focus corruption via `handleFocusChapterSelect`). Documented the partial `messages.length > 0` guard. Removed the wrong "3 entry points" count from v1 — v2 confirms exactly 2 UI entry points for focus→global (both `global_mode` chips) and 1 partially-guarded path for global→focus. |
| B1 | Added clarification: no `next_topic` chip is injected in this case (nextTopicSignal is null); student gets a plain "clarification" message. |
| C2 | Added a **material new finding**: global retrieval is not just missing the OOF branch — it's structurally less strict than focus retrieval because `requireTermMatchForLatinQuery` is only set on the focus path. This makes global mode MORE (not less) susceptible to the weak-match class of bug we just fixed for focus. |
| D1 | Added clarification: the insufficient-context branch (lines 63-67) is mode-independent phrasing; only lines 59 and 94 are focus-centric. Scope of the "focus-centric prompt" concern is smaller than v1 implied. |
| F3 | **v1 error corrected**: `handleSwitchToGlobal` / "Search globally" button is dead code. `isFocusMiss` checks a `focus_context_not_found` status that the backend never emits. Reduced this from a v1 medium concern to a low observation. |
| Cross-cutting | Added grep-verification note about `sessionType`'s true immutability. |

---

## Recommended next step (for discussion — not decided)

Do NOT start fixing yet. Recommended sequence for the discussion phase:

1. **Discuss** the two 🔴s together as one design decision — should `handleClearFocus` / `handleFocusChapterSelect` always start a new session, or should the backend accept mode-mismatched turns and reconcile? Each has tradeoffs (UX vs. state cleanliness). This deserves its own deep-discussion phase.
2. **Decide** what to do about 🟡 B1/B2 — probably fixable within the prompt without touching pipeline code (safest change).
3. **Build `verify-global-mode.js`** BEFORE touching any shared file — same rationale as pre-fix `verify-focus-mode.js` did for Focus Mode. This is G1, and it's the actual loop-breaker.
4. **Only then**, work through the remaining 🟡s in risk order, verifying against BOTH `verify-focus-mode.js` and `verify-global-mode.js` after every shared-file change.

Nothing in this doc is deploy-blocking today. All 🟡s are latent gaps; the two 🔴s require specific user actions to reach. But they are real, and they will grow risk once users are on the app.
