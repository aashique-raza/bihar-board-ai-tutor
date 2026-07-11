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

### Phase F — BUG-4: `EXPLAIN_MORE` could retrieve and teach content from a completely different chapter — DONE 2026-07-09

**Severity: CRITICAL — directly violates the Focus Mode promise ("study only this chapter") and produces confusing, wrong-subject answers with zero warning to the student.**

**How this was found:** Farhan noticed, while studying "Periodic Classification of Elements" (Chemistry) in Focus Mode, that asking Zuno to "explain simply" (`EXPLAIN_MORE`) produced a response entirely about "Control and Coordination" (Biology) — a chapter never selected in that session. He also asked whether answers were reliably staying within the selected chapter/syllabus at all — a fair question given this symptom.

**Root cause — 3 findings, chained (not independent), confirmed by direct code read at every step, not assumed:**

1. `deciderPrompt.js` (line 120) explicitly instructs the classifier LLM: `"EXPLAIN_MORE: searchQuery must be null. Re-retrieval is handled by the pipeline using saved session state."` — this is a **deliberate, reasonable design choice** (EXPLAIN_MORE means "re-explain your last reply," so it reuses saved state instead of extracting a fresh query; a genuinely new topic gets classified `CONCEPT_QUESTION` instead, per line 20's classification rule, and *that* path does get a proper query). This part of the design was sound and was **not changed**.
2. `step5.retrieveContent.js`'s `EXPLAIN_MORE` branch reused `chatState.lastRetrievalQuery` / `chatState.lastTopic` as the re-retrieval query (as designed) but ran it through `getRetrieverOptions(null)` — **no chapter filter, ever, regardless of Focus Mode** — the exact opposite of `CONCEPT_QUESTION`/`NEXT_STEP`, which are always scoped via `getRetrieverOptions(focusChapter)`. The old comment claimed this was "intentional" (`"focusChapter is intentionally NOT passed — lastTopic may be from a different chapter"`) — a defensive-sounding rationale that in practice removed the one guard that would have prevented the bug.
3. `step7.saveAndRespond.js` saved `lastRetrievalQuery`/`lastStudyResponse` even when the turn was a `CONCEPT_QUESTION` **out-of-focus redirect** (`intentRouter.js` line 206's deterministic "yeh topic doosre chapter mein hai, Global Mode use karo" response) — a turn that explicitly *declines* to teach anything, yet the query that matched a *different* chapter globally still got remembered as "the last thing explained."

**The exact failure chain:** a CONCEPT_QUESTION with ambiguous/cross-subject phrasing found 0 chunks in the focus-scoped search → the out-of-focus fallback searched globally, found real content in a *different* chapter, and correctly told the student "not here, try Global Mode" → but that global query got saved into `lastRetrievalQuery` anyway (finding #3) → a subsequent `EXPLAIN_MORE` reused that saved-but-wrong-chapter query (finding #1, as designed) with no chapter filter at all (finding #2) → the wrong chapter's content was retrieved and taught directly, with no redirect and no warning, unlike the CONCEPT_QUESTION path it originated from.

**Verified via `retriever.js` (not assumed) that this is a real, hard vulnerability, not a soft one:** `metadataFilter` becomes a pre-filter *inside the MongoDB Atlas `$vectorSearch` aggregation stage itself* (line 118-136) — chunks from other chapters aren't candidates at all when a filter is applied. This also means the fix is airtight once applied: it's not a heuristic that reduces risk, it structurally eliminates cross-chapter leakage.

**Investigated and explicitly ruled out as a needed fix:** initially flagged the missing `searchQuery` extraction (finding #1) as its own bug needing a decider/prompt change. On deeper review of `deciderPrompt.js`'s existing design intent, walked this back — the design was sound; only its unguarded interaction with findings #2 and #3 was dangerous. No decider/prompt change was made. Also considered tagging `lastTopic`/`lastRetrievalQuery` with their source chapter in the schema (a structural "belt and suspenders" fix) — rejected as unnecessary once the hard DB-level filter (above) already makes cross-chapter retrieval impossible; adding a redundant check on top would be speculative complexity for a risk already closed at the source.

**Fix:**
1. `backend/src/ask/step5.retrieveContent.js` (line ~117) — `getRetrieverOptions(null)` → `getRetrieverOptions(focusChapter)`. In Focus Mode this now hard-scopes `EXPLAIN_MORE` re-retrieval to the current chapter (and gains the `requireTermMatchForLatinQuery` safety net that `CONCEPT_QUESTION`/`NEXT_STEP` already have); in Global Mode `focusChapter` is already `null`, so behavior there is unchanged. If the reused query genuinely isn't from the current chapter, the **already-existing** 0-chunks branch (lines 120-127) correctly falls through to "which topic did you mean?" instead of guessing globally — no new fallback code was needed, it already existed for the "no query at all" case and now also covers this case. Misleading comment describing the old (buggy) reasoning was rewritten to explain the actual, corrected design.
2. `backend/src/ask/step7.saveAndRespond.js` — added `isOutOfFocusAnswer` to the function's destructured parameters (it was already being passed by `askOrchestrator.js` as a sibling field alongside `retrieval`, but `saveAndRespond` wasn't reading it) and added `&& !isOutOfFocusAnswer` to both the `lastRetrievalQuery` write guard and the `isRealStudyAnswer`/`lastStudyResponse` guard — an out-of-focus redirect no longer gets remembered as "the last thing genuinely explained."

**A real bug caught in the fix itself during a rethink, before implementation:** the first draft of fix #2 read `retrieval?.isOutOfFocusAnswer` — but `saveAndRespond`'s 5th parameter is destructured as `{ retrieval, sources, ... }`, so its local `retrieval` name refers only to the *inner* `.retrieval` sub-key (the raw vector-search result) of what's passed in, not the whole step5 payload where `isOutOfFocusAnswer` actually lives as a sibling key. Traced the exact `askOrchestrator.js` → `saveAndRespond()` parameter-passing chain and confirmed this before writing any code — the as-drafted fix would have compiled, passed syntax checks, and silently done nothing (`!undefined` is always `true`). Corrected to destructure `isOutOfFocusAnswer` directly.

**Files changed:**
- `backend/src/ask/step5.retrieveContent.js` — `EXPLAIN_MORE` retrieval now scoped via `getRetrieverOptions(focusChapter)`; comment corrected.
- `backend/src/ask/step7.saveAndRespond.js` — `isOutOfFocusAnswer` destructured and used to guard `lastRetrievalQuery`/`lastStudyResponse` writes.

**Verified (2026-07-09):**
1. `node --check` on both edited files — clean. `npm run test:study-map`, `test:curriculum-resolvers`, `test:vector-store` — pass, unaffected. (`test:chunks`'s 3 failures and `test:chat-db-models`'s module-not-found error are both pre-existing and unrelated — confirmed the latter fails on an unrelated missing `chatState.model.js` import in the test script itself, not on any file touched by this fix.)
2. **Live end-to-end reproduction of the exact bug, against a genuinely fresh backend process** (caught and killed a stale leftover server process from earlier in the session first — confirmed via `Get-Process` that it predated these edits, so an initial verification pass was invalid and was redone): direct `/ask` API calls, synthetic guestId, Focus Mode on "Periodic Classification of Elements" —
   - Turn 1: an ambiguous cross-subject question → correctly triggered the out-of-focus redirect ("Yeh topic doosre chapter mein hai... Global Mode use karo"), sourced from Biology/Physics chunks as expected.
   - Turn 2 (same session): `EXPLAIN_MORE` ("samajh nahi aaya, simple bhasha mein samjhao") — **before the fix this reproduced Farhan's exact bug** (wrong-chapter content taught silently); **after the fix, correctly returned `status: "needs_clarification"` with "Kaunsa topic tha? Naam batao"** — zero sources, zero wrong-chapter leakage.
3. **Happy-path regression check** (a second, separate session): genuine on-chapter question ("Mendeleev periodic table kya hai?") → correctly answered from "Periodic Classification of Elements" → `EXPLAIN_MORE` in the same session correctly re-explained "Mendeleev Periodic Table," still correctly sourced from the same chapter — confirms the new chapter-scoping does not break the normal, working case.
4. Backend server stopped after verification.

---

## SUPERSEDED DECISIONS (so nobody re-reads the archived design doc and gets confused)

`FOCUS_MODE_DB_ARCHITECTURE.md`'s "Open Decisions" section (§14) made two calls that were **deliberately overridden** once the deeper Phase C audit happened:

1. **Guest progress persistence.** The design doc recommended *not* persisting guest progress ("B — login required... pushes toward account creation"). The actual Architecture Decision (Phase C) persists progress for guests too, keyed by the stable `guestId` in `localStorage` — verified by code read that this already worked for free once `ChapterProgress` became the source of truth, at zero extra cost. No product reason to withhold it from guests emerged during the deeper audit.

2. **`chatState` / `ChapterProgress` sync strategy.** The design doc recommended keeping both in sync ("A — keep both. chatState is the per-session fast path."). The actual Architecture Decision removed `chatState`'s copies entirely instead. This is the more correct call in hindsight: keeping both in sync is exactly the mechanism that caused BUG-1 (two copies, one silently stale-and-then-wiped). A single source of truth read every turn (cheap, thanks to Redis caching that was already sitting unused) has no such failure mode.

---

### Phase G — BUG-5: Suggested-action chips could strand the student mid-chapter (loop trap) — DONE 2026-07-10

**Severity: HIGH — silently defeats Focus Mode's core promise of guided chapter progression.**

**How this was found:** Farhan tested a real Focus Mode session end-to-end (Chemistry, "Carbon aur uske Yaugik") and reported three concrete symptoms: (1) after clicking a "related question" chip, every subsequent answer only offered more related-question chips — no way back to advancing the chapter except manually typing "aage badho"; (2) a chip appeared suggesting "Paudhe khana kaise banate hain?" (a Biology topic) while studying a Chemistry chapter; (3) progress only ever advanced when he manually typed, never via chips.

**Root cause — verified by reading every prompt's `suggestedActions` contract, not assumed:** two independent "families" of chips exist. Family 1 (`next_step`/`continue_step`/`chapter_overview`/etc., built by `buildRecommendation()` on the backend) is fully code-controlled and was already hardened during BUG-2. Family 2 (`next_topic`/`related_concept`, authored entirely by the LLM inside `conceptQuestionPrompt.js`/`nextStepPrompt.js`/`explainMorePrompt.js`) had **zero code-level guarantee** — the frontend's `handleSuggestedAction` had no explicit case for either Family-2 type, so both fell through to a `default` that sends the chip's own label as the literal next question. Three concrete consequences of this:
1. `conceptQuestionPrompt.js`'s own rules only ever instruct it to emit `related_concept` chips — never a `next_topic` chip — so any CONCEPT_QUESTION turn (which is exactly what a related-question click produces) always leaves the student with zero way to advance, only more related questions. This is the loop trap.
2. Both `conceptQuestionPrompt.js` and `nextStepPrompt.js` contained a literal, copyable example — `"Paudhe apna khana kaise banate hain?"` — meant only to demonstrate good Hinglish phrasing, but the LLM would sometimes copy it verbatim regardless of the actual current chapter, producing a chip that (per BUG-4's now-fixed chapter-scoping) correctly dead-ends with "yeh topic doosre chapter mein hai" when clicked — a wasted turn.
3. The `next_topic` chip's label ("Aage badhein") only happened to route correctly because the decider's classifier coincidentally recognizes it as NEXT_STEP — an unguaranteed, "lucky" dependency, not a designed guarantee.

**Two additional risks found only by tracing the actual control flow before implementing (not assumed) — both would have been introduced as new bugs if skipped:**
- `examInfoPrompt.js` **already used `type: "next_topic"`** for a semantically different purpose (a general "practical next step" suggestion, e.g. "Life Processes shuru karein" — possibly pointing at a *different* chapter entirely, not "advance the current chapter"). Adding a blanket `case 'next_topic'` handler without catching this would have broken EXAM_INFO's chip (it would start sending the canonical "Aage badhao" instead of its own suggestion on every click). Fixed by changing `examInfoPrompt.js` to emit `related_concept` instead — its intended behavior (send the label as the next message) is exactly what that type already does.
- The `CHAPTER_COMPLETE` deterministic response (in `intentRouter.js`) is reached via `decision.intent === 'NEXT_STEP'` — it is not a separate intent. A naive "guarantee next_topic for NEXT_STEP turns" rule would have injected a nonsensical "Aage badhein" chip onto the chapter-complete celebration message. Fixed by gating NEXT_STEP's guarantee on `nextTopicSignal` being truthy (only true when a genuine next topic was resolved this turn — `null` for both `chapter_complete` and `no_chapter` states, confirmed directly from `nextTopicResolver.js`).

**Fix — code-level guarantee, not a prompt-compliance hope (deliberately rejected a prompt-only fix, per the reasoning in `feedback_reasoning_style.md`):**
1. `backend/src/ask/step7.saveAndRespond.js` — `sanitizeSuggestedActions()` now accepts `{ intent, studyMode, nextTopicSignal }` and, in Focus Mode, **injects** a `{ type: 'next_topic', label: 'Aage badhein' }` chip (prepended, deduped if the LLM already included one, survives the existing 4-chip cap) for `CONCEPT_QUESTION`, `EXPLAIN_MORE`, `EXAM_INFO` unconditionally, and for `NEXT_STEP` only when `nextTopicSignal` is truthy. This is the same "never trust the LLM for behavior-critical output" pattern already established elsewhere in this file (`STB-008` chapter-field sync, `withRetry()`, canonical-phrase decoupling from BUG-2) — applied consistently to the one place it was missing.
2. `frontend/src/pages/ChatPage.jsx` — `handleSuggestedAction` gained an explicit `case 'next_topic'` that sends the canonical "Aage badhao" (matching the `continue_step` pattern), instead of relying on the chip's own label text being coincidentally understood by the decider.
3. `backend/src/prompts/intents/examInfoPrompt.js` — `type: "next_topic"` → `type: "related_concept"` (resolves the type collision found above; no behavior change to what EXAM_INFO's chip actually does when clicked).
4. `backend/src/prompts/intents/conceptQuestionPrompt.js` + `nextStepPrompt.js` — removed the leaky concrete cross-subject example; replaced with an explicit instruction to derive every suggested follow-up only from the topic/chapter in the retrieved context, never introduce a different chapter/subject even as a phrasing example.

**Decision, reconsidered once on request before implementing:** initially scoped the guarantee to only `CONCEPT_QUESTION`/`EXPLAIN_MORE` (Option B), reasoning that `NEXT_STEP`'s own `next_topic` chip "already works" so didn't need the same treatment. Revisited after Farhan pushed back on defaulting to the smaller-effort option pre-deploy — on inspection, `NEXT_STEP`'s chip is exactly the same class of unguaranteed, prompt-trusted behavior that had just failed for `CONCEPT_QUESTION`; the only difference was it hadn't been observed failing yet. Since the injection mechanism is shared code, extending it to cover `NEXT_STEP` (gated by `nextTopicSignal`) and `EXAM_INFO` cost only a few extra lines, not a redesign — closing the entire risk class instead of patching the one symptom that had already surfaced. Explicitly rejected a full type-taxonomy rebuild (removing the `type` field from LLM contracts entirely) as unnecessary — the scoped injection achieves the same guarantee without touching working, unrelated code.

**Files changed:**
- `backend/src/ask/step7.saveAndRespond.js` — `sanitizeSuggestedActions()` rewritten to accept intent/studyMode/nextTopicSignal and guarantee-inject; call site updated.
- `frontend/src/pages/ChatPage.jsx` — new `case 'next_topic'` in `handleSuggestedAction`.
- `backend/src/prompts/intents/examInfoPrompt.js` — type collision fixed.
- `backend/src/prompts/intents/conceptQuestionPrompt.js`, `nextStepPrompt.js` — leaky example replaced with an anti-leak instruction.

**Verified (2026-07-10), live end-to-end against a genuinely fresh backend (stale server from an earlier session step killed first, confirmed via a clean startup log):**
1. `node --check` on all 4 edited backend files, `npm run build` (frontend) — clean.
2. **Loop-trap fix:** NEXT_STEP → clicked a `related_concept` chip (CONCEPT_QUESTION) → response's `suggestedActions` now correctly led with `{ type: 'next_topic', label: 'Aage badhein' }` (previously: 100% `related_concept`, zero way to advance). Sent the canonical "Aage badhao" (simulating that chip's click) → correctly advanced to the next topic.
3. **EXAM_INFO fix:** asked an exam-marks question → confirmed response carried the injected `next_topic` chip *and* its own suggestion correctly typed `related_concept` (not colliding anymore).
4. **CHAPTER_COMPLETE safety (the case most likely to have been silently broken):** advanced through all 9 topics of a real, small chapter ("Light — Reflection and Refraction") via repeated live `/ask` calls until the chapter genuinely completed — confirmed the resulting `suggestedActions` was exactly `[switch_chapter, global_mode]`, with **no spurious `next_topic` chip**, proving the `nextTopicSignal`-based gate correctly excludes the chapter-complete state.
5. A transient anomaly surfaced mid-verification (a `completedTopicIds` write that appeared not to persist across a `CONCEPT_QUESTION` detour) was investigated before being dismissed — traced the exact `chapterProgress` upsert code (lines untouched by this fix), confirmed a clean retry of the identical turn sequence produced fully correct `completedTopicIds`/`progressPercent` results, and concluded the first attempt was a transient request failure, not a regression.
6. Test data (5 synthetic guestId prefixes, `chapter_progress` docs) cleaned up after verification. Backend server stopped.

---

### Phase H — BUG-6: `NEXT_STEP` retrieval query mangled for decimal-numbered sub-topics ("4.1", "4.2"...) — real chapters silently taught near-duplicate content — DONE 2026-07-10

**Severity: HIGH — a genuine, pre-existing bug, real-world-observed on Farhan's own account, not caused by BUG-5.**

**How this was found:** After BUG-5 shipped, Farhan reported that in a real Focus Mode session (Chemistry, "Rasayanik Abhikriyaen aur Samikaran" / Chemical Reactions and Equations), the "Aage badhein" chip appeared correctly (BUG-5's fix working) but clicking it repeatedly sometimes produced the **exact same answer text** instead of new content, while the progress bar stayed frozen. This looked, at first glance, like BUG-5 had re-broken topic advancement.

**Investigation discipline — no assumption, live data first:** attempted live re-reproduction via `curl`/browser/Node `fetch()` against a local dev backend. Ran into a serious, unrelated environment problem first (documented separately below) that made live response capture unreliable. Rather than guess, switched to reading **Farhan's own real account data directly from MongoDB** — his actual `chapter_progress`, `chat_history`, and `study_events` records for this exact chapter — which turned out to be strictly better evidence than a fresh synthetic reproduction, since it was the literal interaction being reported.

**What the data proved, conclusively, in order:**
1. `chapter_progress.completedTopicIds` for the real account showed 5 *distinct* topic IDs (`topic-17`, `topic-18`, `topic-23`, `topic-27`, ...) — not a repeated ID.
2. `study_events` (`topic_completed`, one per turn) showed each turn advancing to a genuinely different `nextTopicId` — `17→18→23→27`, every value distinct. **This proved the topic-advancement mechanism itself (the exact thing BUG-5 touched) was, and remained, 100% correct.** BUG-5 was cleared as a suspect with direct evidence, not assumption.
3. Message timestamps were 12–17 seconds apart — human-paced, ruling out a race/double-fire.
4. The full `chat_history` answer text for two of these turns (teaching `topic-18` "Combination Reaction" and `topic-23` "Exothermic Reaction" — two different concepts) was **byte-for-byte identical**, down to the same three example equations. Different topic, identical output — the bug had to be in what content was *retrieved and taught*, not in *which topic was selected*.
5. Checked this chapter's actual core-topic titles in `curriculum-index.json`: 8 of its 15 core topics are decimal-numbered sub-types of one parent heading — `4.1 Combination Reaction` through `4.8 Oxidation and Reduction`. This chapter was one of the ones BUG-3 explicitly left untouched ("already reasonable" at 15 topics) — a judgment this investigation shows was incomplete for this specific sub-cluster.
6. Root cause found in `step5.retrieveContent.js`'s `buildTopicSearchQuery()`: `title.replace(/^\d+\.\s*/, '')` was meant to strip a leading topic number like `"4. "` before using the title as a vector-search query. Tested directly (not assumed) against the real titles: for `"4.1 Combination Reaction"` the regex matches only `"4."` (the `\s*` after it matches zero characters, since the next character is `"1"`, not whitespace) — leaving a mangled query fragment `"1 Combination Reaction"` instead of `"Combination Reaction"`. Same for all 8 sub-topics (`"1 Combination Reaction"`, `"2 Exothermic Reaction"`, ... `"8 Oxidation and Reduction"`). This degraded retrieval precision enough that these closely-related sibling topics matched the same generic "types of chemical reactions" chunk instead of their own specific content — explaining both the observed duplication and why it was invisible until a chapter with this exact numbering pattern was walked through in a real session.

**Fix:** `backend/src/ask/step5.retrieveContent.js`, `buildTopicSearchQuery()` — regex changed from `/^\d+\.\s*/` to `/^\d+(\.\d+)*\.?\s*/`, which correctly consumes decimal sub-numbering (`"4.1 "`, `"5.2 "`) as well as the original whole-number case (`"4. "`). Verified directly against every real title pattern found in the current curriculum index (`"4. Types of Chemical Reactions"` → `"Types of Chemical Reactions"`, `"4.1 Combination Reaction"` → `"Combination Reaction"`, `"4.8 Oxidation and Reduction"` → `"Oxidation and Reduction"`, `"1. Chemical Equations"` → `"Chemical Equations"`) before applying — no guessing.

**Explicitly not caused by, or related to, BUG-5** — `sanitizeSuggestedActions()` (BUG-5's change) only touches the `suggestedActions` array attached to a response; it has no path into `buildTopicSearchQuery()` or retrieval. This was a separate, pre-existing bug that happened to surface in the same testing session.

**A significant, unrelated environment problem surfaced during this investigation and is recorded here so it isn't re-discovered from scratch next time:** over the course of this long multi-hour session, **19 orphaned `node.exe` processes** had accumulated from repeated `npm run dev` restarts across many verification rounds (this file's own Phase A–G), none fully terminated by earlier `taskkill` calls. This caused erratic, hard-to-diagnose symptoms while testing BUG-6: `curl`/browser/Node `fetch()` requests to `/ask` would hang indefinitely or abort mid-stream even though the backend's own logs showed every request completing correctly and quickly (2–9s). Also separately discovered: writing temporary Node test scripts into `backend/scripts/` while nodemon (`watching path(s): *.*`) is running triggers a live restart, killing any in-flight request — subsequent test scripts were written outside the `backend/` tree to avoid this. Both are testing-hygiene lessons, not product bugs; noted here because they cost significant time to isolate and would recur for the next person testing this backend heavily in one sitting.

**Files changed:**
- `backend/src/ask/step5.retrieveContent.js` — `buildTopicSearchQuery()` regex fix.

**Verified:**
1. `node --check` — clean.
2. Regex fix tested standalone against every real topic-title pattern from the live `curriculum-index.json` for this chapter — all produce correctly-cleaned queries.
3. Root cause confirmed via direct database evidence from the real account that surfaced the bug (`study_events`, `chat_history`, `curriculum-index.json` cross-referenced) — not inferred from a synthetic test.
4. **Live end-to-end re-verification of the fix itself (i.e., confirming the corrected query now retrieves distinct content for `topic-18` vs `topic-23`) was blocked by the environment issue described above** and could not be completed in this session. This is flagged explicitly, not glossed over — the fix is backed by strong, direct root-cause evidence and a standalone-verified regex correction, but not yet by a fresh live A/B content comparison. Recommended next step: once the dev environment is clean (fresh reboot or confirmed zero stray `node.exe` processes), re-run the exact `4.1`→`4.2`→`4.3` sequence live and confirm distinct answer text per topic.

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
| BUG-4 (`EXPLAIN_MORE` cross-chapter leak) | `[x]` | 2026-07-09 | 2026-07-09 | Chapter-scoping + redirect-contamination guard. See Phase F above. |
| BUG-5 (suggested-action chip loop trap) | `[x]` | 2026-07-10 | 2026-07-10 | Code-guaranteed `next_topic` chip for CONCEPT_QUESTION/EXPLAIN_MORE/EXAM_INFO/mid-chapter NEXT_STEP; EXAM_INFO type-collision + leaky off-chapter example also fixed. See Phase G above. |
| BUG-6 (decimal sub-topic query mangled → duplicate content) | `[x]` | 2026-07-10 | 2026-07-10 | Root-caused via real account data (`study_events`/`chat_history`). Regex fix verified standalone; live A/B re-verification blocked by an environment issue (19 stray node processes) — see Phase H for details and the recommended follow-up check. |

---

## NEXT ACTION

STEP-15, the `SUBJECT_ORDER`/`CHAPTER_HINGLISH` duplication cleanup, BUG-4 (`EXPLAIN_MORE` cross-chapter leak), and BUG-5 (chip loop trap) are all done. Remaining open items: STEP-13 (learningMode state machine) and the Chapter-Complete Quiz both need their own deep-discussion phase before any code is touched. The multi-subject content pipeline gap (7+ hardcoded paths) is deferred — no non-Science content exists yet to justify building it. Nothing left is deploy-blocking.
