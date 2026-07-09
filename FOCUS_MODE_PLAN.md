# FOCUS MODE — CONSOLIDATED PLAN (Single Source of Truth)

**Role:** Senior Software Engineer + Senior System Design Engineer + Senior Product Manager
**Consolidated:** 2026-07-09
**Status:** ACTIVE — this file replaces `FOCUS_MODE_MASTER_PLAN.md`, `FOCUS_MODE_DB_ARCHITECTURE.md`, and `FOCUS_MODE_PROGRESS_FIX_PLAN.md`.

**Why this file exists:** Three separate planning files accumulated over several sessions, each partially complete, each referencing the others. That scatter made it hard to tell what was actually done vs. still open — the exact "multiple systems disagreeing" anti-pattern this plan's own bug fixes (below) had to solve in the *code*. This file merges all three into one place: full history (nothing summarized away — the *why* behind every decision is kept), one list of what's actually still open, one place to keep working from.

**The original 3 files are preserved, unmodified, in [`docs/archive/focus-mode/`](docs/archive/focus-mode/)** — for raw historical reference only. Do not treat them as current; several of their design decisions were explicitly overridden during implementation (see "Superseded Decisions" below).

---

## HOW WE WORK (standing contract — read before touching any step)

```
1. Pick the next OPEN step
2. Deep Discussion Phase — re-read background/root cause, raise every doubt/edge case
3. Solution Presentation Phase — multiple options, each with tradeoffs + a recommendation
4. Execution Phase — ONLY after explicit "go ahead" — exact files/lines listed after
5. Verification Phase — manual test steps, regression check against what already works
6. Mark DONE — move to next step
```

**Status Markers:** `[ ]` not started · `[~]` in discussion · `[>]` being implemented · `[x]` DONE — verified and working

**Working style rules (carried over across all sessions on this project):**
- No implementation without explicit approval after discussion.
- No band-aid fixes — if a fix only patches a symptom, say so explicitly and propose the real fix, even if it's more work.
- Prefer fewer, correct abstractions over quick hacks — this product is going to deploy and keep growing, so today's shortcuts become tomorrow's data-migration pain.
- Never delete historical planning docs — archive them instead (this file is itself an example of that rule).

---

## CURRENT ARCHITECTURE (what's true today, as of 2026-07-09)

Focus Mode progress tracking has **one source of truth**: the `ChapterProgress` MongoDB collection (`chapter_progress`), one document per (user × chapter), surviving across all chat sessions.

```
backend/src/models/chapterProgress.model.js
backend/src/services/chapterProgress.service.js   — Redis-cached reads (60s TTL), atomic writes
backend/src/controllers/chapterProgress.controller.js
backend/src/routes/chapterProgress.routes.js

Fields: status ('not_started'|'in_progress'|'completed'|'revising'),
        currentTopicId, completedTopicIds[], totalCoreTopics, progressPercent,
        totalDoubtsAsked, totalExplainMoreCount, totalMessagesExchanged,
        linkedSessionIds[], startedAt, lastStudiedAt, completedAt
```

`ChatSession.chatState` (session-scoped, one doc per conversation thread) keeps **only** `currentSubjectId` / `currentSectionId` / `currentChapterId` — genuinely session-scoped routing info. It does **not** duplicate `currentTopicId` / `completedTopicIds` anymore — those fields were removed from the schema entirely (not deprecated, deleted) once `ChapterProgress` became the single source of truth. This was a deliberate architecture decision (see below) that eliminated an entire category of "which copy do I trust" bugs.

**Read on every focus turn** (not just new sessions) by `step2.loadSession.js`, with a try/catch graceful-degrade if the read fails. **Written on every focus turn** by `step7.saveAndRespond.js` via a shared `withRetry()` helper (1 retry, visible error log on final failure — no more silent write failures).

**Frontend mirrors this exactly:** `ChatPage.jsx` holds `currentTopicId` / `completedTopicIds` / `engagementCount` / `chapterStatus` as local state, synced from the backend's `chapterProgress` payload at every point the session can (re)establish itself — session-restore, chapter-switch-reset, fresh-progress-fetch, live `/ask` response, session-switch. `FocusProgressHeader.jsx` and `FocusModal.jsx` both read from this real data — no guessing, no local-only zeroing.

---

## COMPLETED WORK LOG (chronological, full detail preserved)

### Phase A — Original Master Plan fixes (STEP-1 through STEP-12, `[x]` all DONE, 2026-06-27 to 2026-06-30)

These were the first round of Focus Mode fixes, before the deeper progress-tracking architecture flaw was discovered. Full original detail is in the archived `FOCUS_MODE_MASTER_PLAN.md`; summarized here since none of these were re-touched later:

| Step | What was broken | What was fixed |
|---|---|---|
| STEP-1 | `suggestedActions` (action chips) computed by backend on every response but never rendered — `ChatMessage.jsx` ignored the field entirely | Added render block + `handleSuggestedAction` handler + styles |
| STEP-2 | `completedTopicIds`/`currentTopicId` existed in DB but were never included in the `/ask` session payload sent to frontend | Added to `buildSessionPayload()` — *(later superseded: these fields were removed from `chatState` entirely by the Architecture Decision below — this step's fix no longer applies as written, replaced by the `chapterProgress` payload key)* |
| STEP-3 | `currentTopicId` never reset on chapter switch — switching chapters mid-session kept the old chapter's topic pointer, breaking `getNextTopic()` | Added `isChapterSwitch` detection + reset in `step2.loadSession.js` — *(this exact logic became the root cause of BUG-1 below; fixed differently there)* |
| STEP-4 | `CHAPTER_COMPLETE` returned `suggestedActions: []` — student had zero way to proceed, infinite loop | Added recovery chips (switch_chapter / revise_chapter / global_mode) + frontend handlers |
| STEP-5 | No API exposed chapter topic lists to frontend — blocked all topic-level UI | Added `GET /api/v1/study-map/chapters/:chapterId/topics` |
| STEP-6 | Selecting a chapter left a blank screen — student didn't know what to type | Auto-fires `handleAsk('Shuru karo', ...)` on chapter select |
| STEP-7 | No visible progress indicator in Focus Mode | Built `FocusProgressHeader.jsx` — *(guess-logic in this component became ISSUE-2 below, fixed later)* |
| STEP-8 | Empty-state chips were hardcoded and irrelevant in Focus Mode (showed Biology chips while studying Physics) | Solved inherently by STEP-6's auto-entry — chips became chapter-aware by construction |
| STEP-9 | Decider bias — "Shuru karo" risked misclassifying away from NEXT_STEP | Fixed decider examples + Hinglish rules in `nextStepPrompt.js` |
| STEP-10 | Off-chapter concept questions in Focus Mode got a wrong "not in material" answer (context was empty due to the chapter filter, not because the topic doesn't exist) | Deterministic global-fallback redirect in `intentRouter.js`, no LLM needed |
| STEP-11 | Broad/meta questions ("Science kya hai?") had no source content, violating the "never answer from general knowledge" rule | Solved via prompt updates (`corePersona.js` capabilities text, `redirectPrompt.js` warmth) instead of new RAG content files — smaller, equally effective fix |
| STEP-12 | Chapters lacked exam-pattern context | Added Exam Focus + Key Formulas + Important Questions sections to top 5 chapters |

**Remaining from this phase (still open — see "Open / Remaining Work" below):** STEP-13 (learningMode state machine), STEP-15 (FocusModal hardcoded subjects list). STEP-14 and STEP-16 turned out to be fully absorbed by later work (see Phase C).

---

### Phase B — DB Architecture design (`FOCUS_MODE_DB_ARCHITECTURE.md`, designed 2026-06-28)

This was a **design document**, not an executed task list — it proposed the `chapter_progress` / `study_events` / `user_study_stats` collections and a 6-phase build-out to solve exactly the cross-session resume problem that later became BUG-1/BUG-2 in Phase C. Verified against the current codebase (2026-07-09) which of its phases actually got built, and how:

| Phase | Proposed | Actual status |
|---|---|---|
| Phase 1 (chapterProgress model/service/routes) | Create `chapterProgress.model.js`, service, controller, routes | ✅ Built — via Phase C's Architecture Decision, not this doc directly |
| Phase 2 (APIs) | `GET/:chapterId`, `GET /` (list), `POST /:chapterId/action` | ✅ Built, all 3 endpoints live |
| Phase 3 (frontend resume UX) | Smart welcome, `useChapterProgress` hook, FocusModal "Continue" section | ✅ Built — via Phase C's BUG-2 fix |
| Phase 4 (CHAPTER_COMPLETE fix) | Recovery chips on chapter completion | ✅ Built — via original Master Plan STEP-4/STEP-10 |
| Phase 5 (suggestedActions persistence) | Save chips to `chat_history` so they survive page refresh | ✅ Built — confirmed live: `suggestedActions` field exists in `chatHistory.model.js` |
| Phase 6 (`study_events` + `user_study_stats`) | Event log + materialized stats for future streak/dashboard features | ⚠️ **Half-built** — `studyEvent.model.js` exists and `logStudyEvent()` is actively called from `step7.saveAndRespond.js`; `user_study_stats` collection was never created — correctly deferred per this doc's own instruction: *"Do NOT build speculatively... implement when needed."* |

**This document is now historical** — its actual implementation happened through a different, more rigorous path (Phase C below), which is why it's archived rather than treated as a live task list. See "Superseded Decisions" for the two places its design was deliberately overridden.

---

### Phase C — Progress Tracking Architecture Fix (`FOCUS_MODE_PROGRESS_FIX_PLAN.md`, 2026-07-06 to 2026-07-09) — the real, verified fix

**Why this phase happened:** Pre-deploy testing surfaced 3 directly-observed symptoms: FocusModal showed "5% complete" but opening the chapter showed "0% / Topic 1 of 42"; asking Zuno to resume restarted the chapter instead; chapter headers showed unusable numbers like "Topic 1 of 42". A full code-level audit found the root cause was architectural: **two independent progress-tracking systems existed** (`chatState` — session-scoped — and `ChapterProgress` — cross-session) **that disagreed by design**, plus a code-ordering bug that silently destroyed resume data on every session start.

#### Architecture Decision — ✅ DECIDED (2026-07-06)

**`ChapterProgress` becomes the single source of truth for all topic-level progress. `ChatSession.chatState` no longer stores `currentTopicId`/`completedTopicIds` at all — removed from schema, not just deprecated.**

Reasoning: no production data existed yet (zero migration risk to do this now, the cheapest it will ever be); `chapterProgress.service.js` already had unused Redis caching, so reading it every turn is practically free; `guestId` is stable in `localStorage`, so this works for guests too; this structurally eliminates the entire "which copy do I trust" bug category, including for multi-device use, instead of patching today's specific ordering bug; a GET endpoint already existed with a ready-made "recommendation" object that was built but never wired to the frontend.

Two follow-up decisions locked at the same time: (1) schema cleanup — remove the fields entirely; (2) re-studying a `completed` chapter starts a fresh **revision pass** (progress resets to 0, status becomes `'revising'`) but `completedAt` (the original completion fact) is preserved, not nulled.

**Hidden risks found during re-review and hardened before shipping (not ignored):**
- Removing `chatState`'s redundant copy meant a silent `ChapterProgress` write failure would no longer have a fallback. **Fix:** shared `withRetry()` helper (1 retry, visible error log on final failure) used by both `upsertChapterProgress()` and `markChapterComplete()`.
- The read side (`getChapterProgress()`'s underlying Mongo call) wasn't wrapped in try/catch, and this plan made it run on *every* focus turn instead of just new sessions — a much bigger blast radius for a transient failure. **Fix:** wrapped in `step2.loadSession.js`, graceful degrade to `chapterProgress = null` on failure (self-healing next turn).
- **Known, accepted limitation (not a hidden gap):** two tabs/devices hitting NEXT_STEP on the same chapter in the same instant could race (last-write-wins, no compare-and-swap). Judged disproportionate effort to fix given realistic single-student usage; documented as a conscious tradeoff.

#### BUG-1 `[x]` Cross-session resume completely broken — DONE 2026-07-06

**Root cause:** `step2.loadSession.js` correctly restored `chatState.currentTopicId` from `ChapterProgress` on new sessions — then, 10 lines later in the *same function*, unconditionally wiped it back to `null` because `isChapterSwitch` (comparing `chatState.currentChapterId` against the newly selected chapter) is *always* true on a brand-new session (the field starts at its schema default, `null`). The chapter-switch-detection logic from the original Master Plan's STEP-3 — built for a different, legitimate problem (mid-session chapter switching) — was firing on a case it was never designed for.

**Consequence:** `getNextTopic(chapterId, null)` always returned the first topic, no matter how far the student had actually gotten. Every returning student was forced back to Topic 1 — this was the literal bug from the original screenshot report.

**Fix:** Folded into the Architecture Decision above — once `chatState` no longer stores `currentTopicId` at all, the restore-then-wipe conflict became structurally impossible (there's nothing left to wipe). `step5.retrieveContent.js`'s NEXT_STEP branch now reads `currentTopicId` from `chapterProgress` directly.

**Verified (2026-07-06), end-to-end against the running backend with real MongoDB + Redis:** a 3-turn synthetic-guestId test — new session → advance → **brand-new session** (simulating "New Chat" + reselecting the same chapter) — correctly resumed from the 3rd topic, not Topic 1. Confirmed directly in MongoDB that `chat_sessions` documents no longer have the removed fields at all.

#### BUG-2 `[x]` Chapter re-selection zeroed local state + generic welcome message regardless of progress — DONE 2026-07-07

**Root cause:** `handleFocusChapterSelect()` in `ChatPage.jsx` optimistically zeroed `completedTopicIds`/`currentTopicId` to prevent an unrelated invalid state (converting an active global session into focus), but the guard was too broad — it fired on *every* chapter selection, flashing 0%/Topic 1 even for chapters with real progress. Separately, the focus-entry welcome message (`createFocusMessage()`) was fully static — same 2 chips every time, regardless of whether the student had already made progress. A fully-built backend endpoint (`buildRecommendation()` in `chapterProgress.controller.js`) that computed the *correct* resume-aware message + chips per state (not_started / in_progress / completed / revising) already existed but was never called by the frontend.

**Fix, after a deliberate re-design pass (Farhan asked for a second look before implementing) that caught 3 real problems first:** (1) recommendation chip labels like "Haan, wahan se chalein" risked misclassifying in the decider — solved by decoupling the *display* label from a fixed, already-safe canonical question sent to the backend, no decider changes needed; (2) the "revising" recommendation branch modeled an impossible state (a partial revision — resets always null `currentTopicId`) — simplified; (3) neither existing backend function matched the decided "revise" semantics exactly — generalized `resetChapterProgress()` instead of adding a duplicate. Also gave the "restart from scratch" chip its own `restart_topic` type instead of sharing `next_step` with the "continue" chip.

**Files:** `chapterProgress.service.js`, `chapterProgress.controller.js`, `tutorApi.js`, `ChatPage.jsx` (`handleFocusChapterSelect()` now async, fetches real progress before building the welcome message; `handleSuggestedAction()` gained `next_step`/`chapter_overview`/`restart_topic`/`revise_chapter`/`roadmap` cases).

**Verified (2026-07-07):** fresh chapter → correct "Chalo shuru karte hain!" message; in-progress chapter → correct "Wapas aaye! ... tak pahuche the" message with progress header correct *immediately on selection*, before any ask; roadmap chip made zero network calls; restart/revise flows confirmed correct in MongoDB (revise preserves `completedAt`, restart doesn't).

**Follow-up fix (2026-07-07, found via live real-account testing):** the "continue" chip's message sent the same canonical phrase as "start fresh" (both shared `type: 'next_step'`) — backend behaved correctly either way (NEXT_STEP always resolves from `chapterProgress.currentTopicId`), but the student's own echoed message misleadingly read "start". Gave the continue chip its own `continue_step` type mapped to "Aage badhao" instead.

#### BUG-3 `[x]` Topic granularity unusably fine (11–59 "core" topics per chapter) — DONE 2026-07-09

**Root cause investigated before choosing a fix (not just "shrink the numbers"):** `markdownChunker.js`'s section-merge logic already silently merged small adjacent headings into one embedding chunk during indexing — while `curriculumIndexBuilder.js`'s `role: 'core'` tagging treated each of those same headings as an independent topic for progress-tracking purposes. **Two pipelines already disagreed on the same markdown file** — a third instance of the "two systems, no shared truth" anti-pattern (after `chatState` vs `ChapterProgress`, and `chatState` vs `chapterProgressId` before that). A bolt-on `milestones.json` display-only grouping layer (originally considered) was rejected because it would have created a *fourth* disagreeing system.

**Fix:** restructured markdown heading *levels only* (zero prose changes) across the 11 worst-offending chapters, so genuinely major concepts stay H2 (`role: core`) and sub-details nest as H3/H4 (`role: subtopic`, folded into the parent). Built a reusable, safety-checked script (`backend/scripts/apply-heading-restructure.js`) that verifies every heading match is exact and unique before writing, aborting with no partial writes on any mismatch.

**Result:** counts dropped from a 11–59 range down to 9–13 across all 16 chapters. Full re-embed (`npm run rag:index`, 628 chunks, OpenAI `text-embedding-3-large`) confirmed clean. 3 stale `chapter_progress` docs whose `currentTopicId` no longer resolved to the same concept post-restructure were reset to a clean state.

**Verified (2026-07-08/09):** `npm run curriculum:build` confirmed exact designed topic counts per chapter; resolver test suites unaffected; `test:chunks`'s 3 pre-existing failures confirmed unrelated (via `git stash` comparison); live MongoDB check confirmed previously-mis-grouped content (e.g. "Testes"/"Sperm"/"Vas Deferens") now correctly appears under its real parent heading.

**Accepted side effect (not a bug):** a handful of chapters used H1-as-main-structure with some sub-sections having zero core children, meaning that content was *never reachable by NEXT_STEP at all* before this fix — restructuring incidentally fixed this invisible-content gap.

#### ISSUE-1 `[x]` `completedTopicIds` only grows via NEXT_STEP — student's doubt-asking wasn't reflected anywhere — DONE 2026-07-09

**Decision after deep discussion:** explicitly rejected letting doubt-count influence `progressPercent` or auto-advance topics — this would let a student asking tangential questions get auto-marked "understood" without actually being tested on it (the opposite failure mode), and would require touching the just-stabilized resolver logic for a "nice to have" stat. `NEXT_STEP` advancing on the student's own explicit signal remains trusted at face value — the system has no way to verify genuine comprehension at advance-time (that's a separate, much bigger feature — see the Chapter-Complete Quiz idea below).

**What was built instead:** a second, separate, honest "engagement" stat — `totalDoubtsAsked` / `totalExplainMoreCount`, schema fields that already existed on `ChapterProgress` but were never actually written anywhere. Never blended with `progressPercent`.

**Files:** `step7.saveAndRespond.js` (passes `intent` into the progress upsert), `chapterProgress.service.js` (new `ENGAGEMENT_INTENT_FIELDS` map extending the existing `$inc`), `session.controller.js` (exposes the 2 new fields from the already-fetched doc), `ChatPage.jsx` (new `engagementCount` state, synced at all 5 existing sync points), `FocusProgressHeader.jsx` (new caption line, e.g. "💬 14 sawaal poochhe").

**Verified (2026-07-09):** direct API test sequence (NEXT_STEP → CONCEPT_QUESTION → NEXT_STEP → EXPLAIN_MORE) confirmed the counters increment independently and progress fields stay untouched by doubt/explain turns; live browser check confirmed the caption renders correctly under the progress bar without disturbing the topic count.

#### ISSUE-2 `[x]` `FocusProgressHeader`'s fallback logic was a guess, not a fact — DONE 2026-07-09

**Root cause:** when `currentTopicId` wasn't found in the topics list (which happens whenever progress hasn't loaded yet, or after a BUG-3-style restructure shifts topic IDs), the header guessed chapter state from `completedTopicIds.length === 0` — any non-empty array was assumed to mean "chapter complete", which is wrong for any `in_progress` chapter caught in this edge case.

**Fix (Option A of 3 discussed — chosen over consolidating all progress fields into one state object, and over patching the guess to be merely "safer" without fixing the root cause):** added a `chapterStatus` state var to `ChatPage.jsx`, synced at the same sync points as the sibling fields (session-restore, chapter-switch-reset, fresh-progress-fetch, live `/ask` response, session-switch, plus the global-mode reset branch) — exactly the pattern ISSUE-1 already established. Found during the trace that 3 of 4 backend responses already carried `status`, but `session.controller.js`'s `sessionMeta` object didn't expose it — added that one field.

**Files:** `session.controller.js` (`sessionMeta.chapterStatus`), `ChatPage.jsx` (new state + 6 sync points + prop pass), `FocusProgressHeader.jsx` (guess replaced with `status === 'completed' ? totalTopics : 0`).

**Verified (2026-07-09):** `npm run build` clean; live browser test (fresh Electricity chapter) showed correct "Topic 1 of 13 · 0%" → "Topic 2 of 13 · 8%" progression, confirming the new prop didn't regress the normal path; logic-level test of the exact edge case confirmed `status: 'in_progress'` now correctly resolves to index 0 instead of the old code's incorrect "chapter complete".

#### ISSUE-3 `[x]` Reset/revise backend actions existed but were unreachable from the UI — absorbed into BUG-2, DONE 2026-07-07

Same root cause as BUG-2 (`buildRecommendation()`'s chips were computed but never rendered) — fixed as part of that same change, not separately.

---

### Phase D — STEP-15: FocusModal's hardcoded subjects list — DONE 2026-07-09

**Re-verified against live code first (not assumed from the old plan description), then traced DB → backend → frontend end-to-end before proposing a fix** — this surfaced a bigger picture than the original one-line description ("hardcoded array needs manual update"):

- **The real bug (frontend):** `enrichedSubjects` in `FocusModal.jsx` was built by `.map()`-ing over `baseSubjects` (a hardcoded 6-entry array) — the backend's real `studyMap.focusStudy.subjects` was only consulted afterward, to mark availability. This meant a subject present in the backend's study map but *missing* from `baseSubjects` would never render at all — not just show as "unavailable", but be structurally invisible, no matter what the backend said.
- **`sectionIcons` in the same file looks like the identical pattern but isn't** — it's used as a lookup-with-fallback *over real backend section data* (`sections.map(...)`, not `sectionIcons.map(...)`), so a new section always renders, worst case with a generic icon. Confirmed via code read, not assumed — left untouched, only documented with a clarifying comment so it isn't mistaken for the same bug class later.
- **Backend-side check requested explicitly by Farhan before implementing** ("dono mein hai kya check karo") surfaced two real, separate findings that do **not** block or belong in this fix:
  1. `data/class-10/science` is hardcoded as the only content directory in **7+ backend files** (`rag/indexPipeline.js`, `curriculum/curriculumIndexStore.js`, `services/studyMap.service.js`, plus 4 inspector/test scripts) — meaning launching a genuinely new subject (Hindi/Math content) is a full content-pipeline expansion, not a small config edit anywhere. Logged as new open work below, not built now (no Hindi/Math content exists yet — building this today would be speculative).
  2. `SUBJECT_ORDER` (the 6-subject ordering array) is independently duplicated in **2 backend files** (`services/studyMap.service.js` and `curriculum/curriculumIndexBuilder.js`) with no shared source — consistent today, no automated guarantee against future drift. Logged as new open work below.
  - Also noticed in passing (not part of STEP-15, same duplication *pattern* though): `CHAPTER_HINGLISH` exists as two independently-maintained copies, one in `backend/src/constants/chapterHinglish.js` and one in `frontend/src/constants/chapterHinglish.js`, both carrying a "must be kept in sync" comment. Logged as its own open item — out of scope here, but the same underlying pattern.

**Decision (after discussion, before implementing):** keep the "Jald aata hai" placeholder tiles (product wants roadmap visibility, not just available subjects); a small manual config step (icon assignment) for a genuinely new subject launch is acceptable — but the fix must guarantee no subject silently becomes invisible even if that manual step is forgotten.

**Fix — Option A (chosen over a dev-only console-warning patch, which was rejected: it doesn't fix production, only alerts during dev):** `baseSubjects` renamed to `SUBJECT_META`, repurposed as a pure icon/title lookup, not the render source. The actual render list is now the **union** of `SUBJECT_META`'s keys and `studyMap.focusStudy.subjects`' real ids — any subject with real content always renders (using its live title + a `DEFAULT_SUBJECT_ICON` fallback if not yet in `SUBJECT_META`); any `SUBJECT_META` entry without live content still renders as a "Jald aata hai" placeholder, exactly as before.

**Files changed:** `frontend/src/components/FocusModal.jsx` — `baseSubjects` → `SUBJECT_META` (+ `SUBJECT_META_ORDER`, `DEFAULT_SUBJECT_ICON`); `subjectsInMap` removed (folded into the new `enrichedSubjects` union logic); clarifying comment added above `sectionIcons` explaining why it didn't need the same fix.

**Verified (2026-07-09):**
1. `npm run build` — clean.
2. Live browser regression check (guest mode): FocusModal showed the exact same 6 subjects, same order, same labels/chapter-counts as before the fix ("Hindi/English/Math/Social Science/Sanskrit — Jald aata hai", "Science — 16 chapters") — plus "Jahan Chhoda Tha" (Electricity, 8%) still rendering correctly. No visual regression.
3. Logic-level test of the exact bug scenario: simulated a `studyMap` subject (`geography`) not present in `SUBJECT_META` — confirmed the **old** logic (`baseSubjects.map()`) could never surface it (`oldWay_geographyVisible: false`) while the **new** logic correctly renders it with a live title + fallback icon (`newWay_geographyVisible: true`).

---

### Phase E — `SUBJECT_ORDER` + `CHAPTER_HINGLISH` duplication cleanup — DONE 2026-07-09

Both items were found during STEP-15's backend trace and initially logged as deferred, low-priority cleanup. **Revisited on Farhan's explicit pushback** ("you keep recommending the easy option, not the future-proof one — the app isn't deployed yet, this is the cheapest time to do it right") — the first pass on `CHAPTER_HINGLISH` had judged a real single-source fix as "disproportionate" without actually tracing the API surface first. A full re-trace found that judgment was wrong.

**`SUBJECT_ORDER`/`SECTION_ORDER` (2 backend files, same runtime — straightforward):** Extracted to a new shared file, `backend/src/constants/subjectOrder.js`. `studyMap.service.js` and `curriculumIndexBuilder.js` both import from it now instead of maintaining independent copies. Zero behavior change, zero remaining duplication.

**`CHAPTER_HINGLISH` (backend + frontend, different runtimes — re-traced, not assumed):** The full API surface trace found the real fix was much smaller than first estimated:
- `listChapterProgressController` **already returned `hinglishTitle`** — the frontend (`FocusModal.jsx`) was simply not using it, doing its own redundant lookup instead.
- `studyMap.service.js` (chapter objects, consumed by `Topbar.jsx` and `FocusModal.jsx`) had no `hinglishTitle` field — one line added to `createChapterItem()`.
- `sourceFormatter.js` (`/ask` response sources, consumed by `ChatMessage.jsx`'s source footnote) had no `hinglishTitle` field — one line added.

With those 2 small backend additions (both reusing the existing single `backend/src/constants/chapterHinglish.js` map — no new lookups), every frontend consumer could read `hinglishTitle` directly off already-fetched data. **`frontend/src/constants/chapterHinglish.js` was deleted entirely** — true single source of truth, not a sync-check band-aid on top of two copies.

**Files changed:**
- New: `backend/src/constants/subjectOrder.js`
- `backend/src/services/studyMap.service.js` — imports `SUBJECT_ORDER`/`SECTION_ORDER` from the new shared file; `createChapterItem()` now includes `hinglishTitle`
- `backend/src/curriculum/curriculumIndexBuilder.js` — imports `SUBJECT_ORDER`/`SECTION_ORDER` from the new shared file
- `backend/src/rag/sourceFormatter.js` — source objects now include `hinglishTitle`
- `frontend/src/components/FocusModal.jsx` — uses `cp.hinglishTitle` directly (kept `chapterTitleMap` only for its existing-chapter validity check); `CHAPTER_HINGLISH` import removed
- `frontend/src/components/Topbar.jsx` — uses `selectedChapter.hinglishTitle`; `CHAPTER_HINGLISH` import removed
- `frontend/src/components/ChatMessage.jsx` — `extractChapterName()` prefers `src.hinglishTitle`, falls back to the existing English-parsing logic only for sources without a structured `chapterTitle` (defensive, not expected to trigger given current backend behavior); `CHAPTER_HINGLISH` import removed
- Deleted: `frontend/src/constants/chapterHinglish.js`

**Verified (2026-07-09):**
1. `npm run build` (frontend) — clean. `node --check` on all 4 edited backend files — clean.
2. `npm run test:study-map` — unaffected (1 subject, 16 chapters, correct section breakdown). `npm run test:curriculum-resolvers` — unaffected (same pass output as before).
3. Live browser test (guest mode, Electricity chapter with existing 8% progress): FocusModal's "Jahan Chhoda Tha" card correctly showed "Bijli 8% complete" via `cp.hinglishTitle`; after selecting the chapter, Topbar correctly showed "Bijli" via `selectedChapter.hinglishTitle`; after an `/ask` turn, the message's source footnote correctly showed "— Bijli" via `source.hinglishTitle` — all 3 consumers confirmed working from the single backend source, zero frontend lookup table.
4. Confirmed via grep: zero remaining references to `CHAPTER_HINGLISH`/`chapterHinglish` in `frontend/src` other than 2 explanatory code comments.

---

## SUPERSEDED DECISIONS (so nobody re-reads the archived design doc and gets confused)

`FOCUS_MODE_DB_ARCHITECTURE.md`'s "Open Decisions" section (§14) made two calls that were **deliberately overridden** once the deeper Phase C audit happened:

1. **Guest progress persistence.** The design doc recommended *not* persisting guest progress ("B — login required... pushes toward account creation"). The actual Architecture Decision (Phase C) persists progress for guests too, keyed by the stable `guestId` in `localStorage` — verified by code read that this already worked for free once `ChapterProgress` became the source of truth, at zero extra cost. No product reason to withhold it from guests emerged during the deeper audit.

2. **`chatState` / `ChapterProgress` sync strategy.** The design doc recommended keeping both in sync ("A — keep both. chatState is the per-session fast path."). The actual Architecture Decision removed `chatState`'s copies entirely instead. This is the more correct call in hindsight: keeping both in sync is exactly the mechanism that caused BUG-1 (two copies, one silently stale-and-then-wiped). A single source of truth read every turn (cheap, thanks to Redis caching that was already sitting unused) has no such failure mode.

---

## OPEN / REMAINING WORK

| Item | Origin | Priority | Notes |
|---|---|---|---|
| STEP-13 — Real `learningMode` state machine (`'doubt'`/`'quiz'` modes exist in schema, never actually used) | Old Master Plan | Post-launch feature | ~1 week effort, needs a new decider intent + prompt work. Deliberately deferred. |
| `user_study_stats` collection (streak tracking, subject-level dashboards) | DB Architecture Phase 6 | Deferred by design | Build only when a specific feature needs it — explicit instruction in the original design doc, still correct. |
| Chapter-Complete Quiz (verify real comprehension before/after NEXT_STEP, surface weak topics) | Raised during ISSUE-1 discussion, 2026-07-09 | Future feature, not a bug | Materially bigger scope — needs question generation/bank per chapter, scoring logic, new UI flow, and a "pass" threshold decision for an already-`completed` chapter. Needs its own deep-discussion phase when picked up. |
| Multi-subject content pipeline — `data/class-10/science` is hardcoded as the only content directory in 7+ backend files | Found during STEP-15's backend trace, 2026-07-09 | Not deploy-blocking, currently irrelevant | Real gap, but only matters once Hindi/Math/etc. content actually gets written — building this today would be speculative (no content exists to test it against). Revisit when the first non-Science subject is ready to launch. |

**Nothing in this list is deploy-blocking.** All 3 confirmed bugs, both secondary issues, the architecture decision that unified the two progress systems, STEP-15, and the `SUBJECT_ORDER`/`CHAPTER_HINGLISH` duplication cleanups are done and verified. The remaining items are scoped enhancements for a later session.

---

## EXECUTION LOG (consolidated)

| Item | Status | Date Started | Date Done | Notes |
|---|---|---|---|---|
| Master Plan STEP-1 through STEP-12 | `[x]` | 2026-06-27 | 2026-06-30 | — |
| DB Architecture Phases 1–5 | `[x]` | 2026-06-28 (designed) | 2026-07-09 (confirmed built, via Phase C) | — |
| DB Architecture Phase 6 | `[~]` | — | — | `studyEvent` model + logging live; `user_study_stats` correctly deferred |
| Architecture Decision (ChapterProgress = source of truth) | `[x]` | 2026-07-06 | 2026-07-06 | — |
| BUG-1 (cross-session resume wiped) | `[x]` | 2026-07-06 | 2026-07-06 | — |
| BUG-2 (frontend zeroing + generic welcome) | `[x]` | 2026-07-06 | 2026-07-07 | — |
| BUG-3 (topic granularity, 11–59 → 9–13) | `[x]` | 2026-07-08 | 2026-07-09 | — |
| ISSUE-1 (engagement stat, doubt-count not blended into progress) | `[x]` | 2026-07-09 | 2026-07-09 | — |
| ISSUE-2 (header fallback guesswork → real status field) | `[x]` | 2026-07-09 | 2026-07-09 | — |
| ISSUE-3 (unused revise/reset UI) | `[x]` | 2026-07-06 | 2026-07-07 | Absorbed into BUG-2 |
| STEP-15 (FocusModal hardcoded subjects) | `[x]` | 2026-07-09 | 2026-07-09 | Union-with-fallback fix in `FocusModal.jsx`. See Phase D above. |
| STEP-13 (learningMode state machine) | `[ ]` | — | — | — |
| Chapter-Complete Quiz | `[ ]` | — | — | Parked, not scoped yet |
| Multi-subject content pipeline (7+ hardcoded paths) | `[ ]` | — | — | Found during STEP-15 trace. Deferred — no non-Science content exists yet. |
| `SUBJECT_ORDER`/`CHAPTER_HINGLISH` duplication cleanup | `[x]` | 2026-07-09 | 2026-07-09 | Both fully eliminated — single source of truth in both cases. See Phase E above. |

---

## NEXT ACTION

STEP-15 and the `SUBJECT_ORDER`/`CHAPTER_HINGLISH` duplication cleanup are done. Remaining open items: STEP-13 (learningMode state machine) and the Chapter-Complete Quiz both need their own deep-discussion phase before any code is touched. The multi-subject content pipeline gap (7+ hardcoded paths) is deferred — no non-Science content exists yet to justify building it. Nothing left is deploy-blocking.
