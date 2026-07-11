# FOCUS MODE — VERIFICATION CHECKLIST (Phase 2: breaking the fix→break→fix loop)

**Created:** 2026-07-10
**Purpose:** For the last ~20 days, every Focus Mode fix has been verified manually (one flow, by hand, in the browser), which is slow enough that regressions in *other* flows go unnoticed until the student hits them. This file is the exhaustive, code-verified list of everything that must be true for Focus Mode to be considered working. It is the input to the next step: an automated script (`scripts/run-golden-set.js`'s pattern, extended) that runs this whole list in one command instead of relying on memory of what to re-check.

**This file does NOT change anything.** No code was modified while producing it. It is pure verification scope.

**Status markers:** `[ ]` not yet verified against current running code · `[x]` verified in this pass (see "Recently verified live" notes in `FOCUS_MODE_PLAN.md` — some items were already confirmed there and are marked accordingly).

---

## Methodology (so the next person trusts this list)

Every item below was derived by **directly reading the current source** — not by copying `FOCUS_MODE_PLAN.md`'s narrative, though that file was cross-checked against. Specifically read in full for this pass (2026-07-10):

- Backend: all 7 ask-pipeline steps + orchestrator + intentRouter + intentSafetyNet + promptHelpers (11 files), all 12 intent/decider/tutor prompts, all 5 DB models, all 4 services, all controllers+routes (8 files), all 6 curriculum resolvers, all 4 RAG retrieval files, 2 shared constants files.
- Frontend: `ChatPage.jsx` (full), `FocusModal.jsx`, `FocusProgressHeader.jsx`, `ChatMessage.jsx`, `Topbar.jsx`, `tutorApi.js`, `useChapterProgress.js`, `useChapterTopics.js`, `utils/studyMap.js`, `utils/session.js`, `constants/studyModes.js`.
- Cross-checked against `backend/test/golden-queries.json` + `run-golden-set.js` (existing test infra) and `PROBLEMS.md` (an older, independent 2026-06-03 audit) — both had drifted from current code in places; every claim from either was re-verified against the live file before being trusted here (see "Stale-doc corrections" below).

Where something couldn't be confirmed with full certainty, it's marked **UNVERIFIED** below rather than guessed.

---

## New findings from this pass (not previously documented anywhere)

These surfaced from direct code tracing during this audit — not copied from any existing doc. Flagging prominently since they're exactly the class of thing a manual, one-flow-at-a-time test misses.

**Decisions locked 2026-07-10 (Farhan + full review of this file):**

1. **`nextTopicResolver.js:54-55` — stale/unresolvable `currentTopicId` silently reported "chapter complete".** ✅ **FIXED (2026-07-10).** If a student's saved `currentTopicId` doesn't exist in the current curriculum index (exactly what happened once already in BUG-3's restructure — 3 docs needed manual DB fixes), `getNextTopic()` used to return `status: 'chapter_complete'` — the *same* signal as genuinely finishing every topic. Fix: when the pointer can't be resolved, self-heal to topic 1 and log a warning (`console.warn('[nextTopicResolver] currentTopicId ... not found ... resyncing to topic 1')`) instead of reporting false completion. Verified directly (not via the existing test suite, which doesn't exercise this path): a bogus `currentTopicId` now resolves to topic 1 with a warning logged, and a genuinely-last topicId still correctly returns `chapter_complete` (regression-checked).
2. **Guests lose all Focus Mode context on page refresh (logged-in users don't).** ✅ **ACCEPTED, NOT FIXING NOW** — explicit product decision (Farhan, 2026-07-10): guest Focus Mode UX is deprioritized until the logged-in experience is fully stable. See `project_focus_mode_guest_scope` memory. Their actual `ChapterProgress` document is safe and correctly resumable (confirmed: `chapterProgress.routes.js` uses `optionalAuth`, works for guests) — only the automatic-restore-on-refresh UX is missing for guests. Not in the checklist below anymore.
3. **Two independent, byte-for-byte-identical slugify implementations** — `curriculumIndexBuilder.js` (`normalizeIdPart`) and `studyMap.service.js` (`slugify`). ✅ **FIXED (2026-07-10).** Extracted to `backend/src/utils/slugify.js`, both files now import the shared function. Verified: `npm run test:study-map` (16 chapters, 7/5/4 split — unchanged) and `npm run test:curriculum-resolvers` (unchanged output) both pass after the change, confirming no chapter/section/subject ID shifted.
4. **`chapterProgress.controller.js:190` hardcodes `16`** as the total chapter count for the `notStartedCount` summary tile. **NOTE ONLY — not fixing now.** Correct today; would only drift the moment a chapter is added/removed, which isn't planned (multi-subject content pipeline is separately deferred). Fixing this now would be speculative work against CLAUDE.md's own "do not overbuild" rule.
5. **Stale comment**: `backend/src/constants/chapterHinglish.js:2` still says "must be kept in sync with frontend/src/constants/chapterHinglish.js" — that frontend file was deleted in Phase E. **NOTE ONLY — trivial, cosmetic, fix opportunistically if that file is touched for another reason.**

---

## Stale-doc corrections (things two existing docs got wrong, now corrected)

- `PROBLEMS.md` (2026-06-03) marks **STB-003** (no rate limiting), **SEC-002** (open CORS), **SEC-004** (no Helmet) as PENDING. All three are fixed today — confirmed directly in `backend/src/app.js`: `helmet()` (line 22), origin-whitelisted CORS via `FRONTEND_URL` (lines 26-44), `globalApiLimiter` + route-level `askApiLimiter`/`guestRateLimit` (ask.routes.js). **TDT-006** (`/health` not under `/api/v1/`) is still accurate — confirmed still true.
- `PROBLEMS.md`'s **STB-004/006/007, TDT-002/010** all describe a JSON-file `MemoryVectorStore` + `CHAPTER_STORE_CACHE` architecture that **no longer exists** — the RAG layer now runs on MongoDB Atlas `$vectorSearch` (confirmed via `retriever.js` header comment + literal `vectorStorePath: 'MongoDB Atlas Vector Search'` in its return payload). Not "fixed" — the subsystem these items describe was replaced wholesale. `CLAUDE.md`'s own "Full Tech Stack" section is stale on this same point (still says "MemoryVectorStore... persisted to JSON file").
- `PROBLEMS.md`'s **PRD-004** (FocusModal hardcoded subjects) and **BUG-006/007** (NEXT_STEP/completedTopicIds) are superseded by `FOCUS_MODE_PLAN.md` Phase D and Phase C/original Master Plan respectively — confirmed fixed by direct code read.
- `PROBLEMS.md`'s **PRD-005** (`isFocusMiss`/`focus_context_not_found` dead status check in `ChatMessage.jsx`) is **still accurate** — independently re-confirmed in this pass via grep: the backend never emits this status anywhere. Dead code, harmless, still there.
- The existing `backend/test/golden-queries.json` has 4 `NEXT_STEP` test cases (`N01`-`N04`) with `studyMode: "focus"` but **no `chapterId`** — `step1.validateInput.js` requires `chapterId` for focus mode, so these 4 cases likely fail validation (400) on every run. Its saved baseline (`golden-baseline-phase1.json`) is dated 2026-06-17, predating all of Phase C–H — not representative of current behavior.

---

## THE CHECKLIST

### A. Session lifecycle & resume

- [ ] Fresh chapter (never studied) selected → welcome message says "Chalo shuru karte hain!" style text, chips = `next_step` (Shuru karo) + `chapter_overview`
- [ ] Chapter with `status: in_progress` selected → welcome message says "Wapas aaye!... tak pahuche the", chips = `continue_step` + `restart_topic` + `roadmap`; progress header shows correct topic/% **immediately on selection**, before any `/ask` call
- [ ] Chapter with `status: completed` selected → welcome message offers revise/switch, chips = `revise_chapter` + `switch_chapter`
- [ ] Chapter with `status: revising` selected → behaves like fresh-start (chips = `next_step` + `chapter_overview`), since a revision reset always nulls `currentTopicId`
- [ ] New session (simulating "New Chat" + reselect same chapter) resumes from the correct topic, not topic 1 — **BUG-1 regression guard**
- [ ] Logged-in user refreshes mid-chapter → messages AND focus state (topic/%%/status) both fully restored from `GET /sessions/:id/history`
- ~~Guest refreshes mid-chapter~~ — **out of scope, accepted** (see New Finding #2). Guest Focus Mode UX is explicitly deprioritized right now; not tested as part of this checklist.
- [ ] Switching between two different sessions (HistoryPanel) that are each on a different focus chapter → no state bleed between them (topic/%/chips of session A never leak into session B)

### B. Topic advancement (NEXT_STEP)

- [ ] "Aage badhao" from a fresh chapter → teaches topic 1
- [ ] Repeated "Aage badhao" through a chapter with decimal sub-numbered topics (e.g. Chemical Reactions' "4.1"–"4.8") → each topic's taught content is genuinely distinct, not a repeat — **BUG-6 regression guard, never live-verified end-to-end** (plan file explicitly flags this as the one unfinished verification from Phase H, blocked by an environment issue at the time)
- [ ] NEXT_STEP on the final topic → `CHAPTER_COMPLETE` message, chips are exactly `[switch_chapter, global_mode]`, **no** `next_topic` chip, `ChapterProgress.status` → `completed`, `progressPercent` → 100, `completedAt` set
- [ ] `completedTopicIds` grows by exactly one per real NEXT_STEP advance, never duplicates, never skips
- [ ] A chapter whose `currentTopicId` doesn't resolve in the current curriculum index → resyncs to topic 1 with a logged warning, does **not** mislabel as chapter_complete — **✅ fixed 2026-07-10 (New Finding #1), standalone-verified; add to the v1 script as a direct regression guard.**

### C. Suggested-action chip guarantees (BUG-5 class)

- [ ] `CONCEPT_QUESTION` response always includes an injected `next_topic` ("Aage badhein") chip, in addition to the LLM's own `related_concept` chips
- [ ] `EXPLAIN_MORE` response always includes the injected `next_topic` chip (prompt itself never emits any chip)
- [ ] `EXAM_INFO` response includes both the injected `next_topic` chip AND its own chip correctly typed `related_concept` (not colliding)
- [ ] `NEXT_STEP` (real mid-chapter advance) response includes `next_topic`
- [ ] `NEXT_STEP` reaching `CHAPTER_COMPLETE` does **not** get a spurious `next_topic` chip
- [ ] Every chip `type` emitted anywhere has a matching `case` in `ChatPage.jsx`'s `handleSuggestedAction`: `switch_chapter`, `global_mode`, `next_step`, `continue_step`, `next_topic`, `chapter_overview`, `restart_topic`, `revise_chapter`, `roadmap`, and the `related_concept`/default fallback (sends label as-is)
- [ ] Clicking a chip never sends a mislabeled question — specifically `continue_step` sends "Aage badhao" (not "Chapter shuru karein"), matching what actually happens (resume, not restart)
- [ ] "Roadmap" chip renders the current topic window client-side with zero network/LLM calls

### D. Cross-chapter isolation (BUG-4 class)

- [ ] A `CONCEPT_QUESTION` whose topic exists only in a *different* chapter than the one selected → out-of-focus redirect message ("yeh topic doosre chapter mein hai... Global Mode use karo"), sourced from the real other-chapter content but **not taught directly**
- [ ] Immediately after that redirect, `EXPLAIN_MORE` ("samajh nahi aaya") in the **same session** → must return `needs_clarification` ("Kaunsa topic tha?"), must **not** teach the other chapter's content — **the exact BUG-4 reproduction case**
- [ ] A genuine on-chapter `CONCEPT_QUESTION` followed by `EXPLAIN_MORE` in the same session → correctly re-explains the *same* chapter's content, confirming the chapter-scoping fix doesn't break the normal path

### E. Engagement stats (ISSUE-1)

- [ ] `CONCEPT_QUESTION` turns increment `totalDoubtsAsked` only
- [ ] `EXPLAIN_MORE` turns increment `totalExplainMoreCount` only
- [ ] Neither increments `completedTopicIds`/`progressPercent`
- [ ] `FocusProgressHeader`'s "💬 N sawaal poochhe" caption appears only once `engagementCount > 0`, and matches `totalDoubtsAsked + totalExplainMoreCount` exactly

### F. Progress header correctness (ISSUE-2)

- [ ] Fresh `in_progress` chapter where `currentTopicId` isn't yet resolvable in the loaded `topics` list → shows "Topic 1 of N · 0%", never misreports complete
- [ ] A `completed` chapter re-opened → header correctly reflects 100%/complete, not a guess based on array length
- [ ] Numbers are consistent across all three places they render: `FocusProgressHeader`, FocusModal's "Jahan Chhoda Tha" card %, and the `roadmap` chip's topic list

### G. FocusModal correctness (STEP-15 class)

- [ ] All 6 subjects (Hindi/English/Math/Science/Social Science/Sanskrit) always render even if a subject is added to the live study map but not yet to `SUBJECT_META` (union-with-fallback logic)
- [ ] "Jahan Chhoda Tha" only lists chapters that still exist in the current curriculum (`chapterTitleMap` guard) — a chapter_progress doc for a removed/renamed chapter is silently skipped, not shown broken
- [ ] Every listed in-progress chapter shows its real `hinglishTitle` (from the backend, not a frontend lookup) and correct rounded %

### H. Restart / revise actions

- [ ] "Revision karo" on a `completed` chapter → `status` → `revising`, `progressPercent` → 0, `currentTopicId` → null, but `completedAt` is **preserved**, not nulled
- [ ] "Topic 1 se fresh shuru" on an `in_progress` chapter → `status` stays `in_progress`, progress resets to 0
- [ ] Immediately after either reset, "Aage badhao" resolves from topic 1 fresh — no stale pointer left over

### I. Explicitly accepted, not required to test exhaustively

- Two tabs/devices hitting NEXT_STEP on the same chapter at the same instant (documented last-write-wins tradeoff, Phase C) — one smoke check that it doesn't crash is enough, not a full race-condition suite.

---

## Explicitly OUT of scope for this checklist

Per "no new features, only fix what exists" — these are real, found-in-passing, but **not Focus-Mode-specific** and not part of this pass:
- Security/deployment items from `PROBLEMS.md` unrelated to Focus Mode (SEC-003 sessionId-as-UUID validation status, FET-001 deployment config, FET-003 streaming — note streaming actually already exists per `askOrchestrator.js`/`tutorApi.js`, that FET item is stale too but outside this doc's purpose to correct in full)
- `TDT-004` dead code (`createChatSession`/`getOrCreateChatSession`) — confirmed still genuinely unused, harmless, cleanup-only
- Multi-subject content pipeline (hardcoded `data/class-10/science` path) — already logged as deferred in `FOCUS_MODE_PLAN.md`, no non-Science content exists to test against yet

---

## Next step

**Reviewed and prioritized with Farhan (2026-07-10).** Sections **A (minus the guest line), B, C, D** are the v1 target — these are the four tied to confirmed, previously-real bugs (BUG-1, BUG-6, BUG-5, BUG-4). Sections **E, F, G, H** are real but lower-stakes (no confirmed live bug found in this pass) and will be added to the same script as a v2 pass once v1 is proven out — deliberately not building coverage for all 8 sections in one go.

Script reuses `run-golden-set.js`'s HTTP-call pattern, but drives multi-turn sequences against a fixed `sessionId` per test, and asserts on `suggestedActions`, `chapterProgress` fields, and — where needed — direct MongoDB reads, not just a single-turn intent check like the existing golden set. That script becomes the thing you run after every future fix instead of re-testing by hand.
