# FOCUS MODE — PROGRESS TRACKING ARCHITECTURE FIX PLAN

**Role:** Senior Software Engineer + Senior System Design Engineer + Senior Product Manager
**Experience:** 20 years combined product & engineering leadership
**Created:** 2026-07-06
**Status:** ACTIVE — Single source of truth for all progress-tracking bug fixes. `FOCUS_MODE_MASTER_PLAN.md` is paused until this file is fully DONE.

**Do not re-explain the role/workflow below in future messages — just say "check the plan" or reference a STEP number. This file is the standing contract for how we work together on this.**

---

## HOW WE WORK (read this before touching any step)

This is not a "list bugs, fix bugs" file. Every step below is **discussed to the ground before a single line of code is written**:

```
1. Pick the next OPEN step (in order — later steps may depend on earlier decisions)
2. Deep Discussion Phase
   - Re-read the step's Background / Root Cause / Evidence
   - Raise every doubt, edge case, "what if" you can think of — all get answered
3. Solution Presentation Phase
   - Multiple solution options presented, each with:
     - How it works
     - Tradeoffs (complexity, cost, migration pain, future flexibility)
     - Edge cases it introduces or fixes
     - A recommendation, with reasoning — never just "pick one"
   - Explicit focus on: is this future-proof / scalable, or a patch that will bite us again?
4. Execution Phase
   - ONLY after you say "go ahead" (or equivalent) — no implementation before that
   - Exact files changed, exact lines touched, listed here afterward
5. Verification Phase
   - Manual test steps — what to click, what to type, what to check in DB/logs
   - Regression check — did this break any other Focus Mode behavior already working
6. Mark DONE — move to next step
```

**Status Markers:**
- `[ ]` — Not started
- `[~]` — In discussion / being designed
- `[>]` — Currently being implemented
- `[x]` — DONE — verified and working

**Working style rules (carried over from prior sessions):**
- No implementation without explicit approval after discussion.
- No band-aid fixes. If a fix only patches a symptom and the underlying two-systems conflict remains, say so explicitly and propose the real fix, even if it's more work.
- Prefer fewer, correct abstractions over quick hacks — this product is going to deploy and then keep growing (more subjects, more chapters), so today's shortcuts become tomorrow's data-migration pain.

---

## WHY THIS FILE EXISTS

While testing Focus Mode before deployment, the following was observed directly in the product:

1. FocusModal showed a chapter as "5% complete" — but clicking into it showed **0% / Topic 1 of 42**.
2. Asking "jaha chhoda tha wahi se shuru karo" (continue where I left off) resulted in Zuno restarting the chapter from Topic 1, not resuming.
3. The chapter header showed **"Topic 1 of 42"** — a number no student can realistically work through turn-by-turn.

A full code-level audit (frontend + backend + DB schema + curriculum content) was done in response. The root cause is architectural, not cosmetic: **two independent progress-tracking systems exist in this codebase, they don't agree with each other, and a code-ordering bug silently destroys cross-session resume data on every single focus-session start.**

This must be fixed properly before deploy — not patched — because progress tracking is a core Focus Mode promise to the student ("Zuno remembers where you left off").

---

## SYSTEM CONTEXT — THE TWO PROGRESS SYSTEMS (Read Before Any Step)

### System A — Session-scoped progress (`chatState`)

Lives inside `ChatSession.chatState`, one document per chat session (a session = one conversation thread, student can have many over time).

```
backend/src/models/chatSession.model.js
  chatState.currentChapterId    String | null   — default: null on every new session
  chatState.currentTopicId      String | null   — default: null on every new session
  chatState.completedTopicIds   [String]        — default: [] on every new session
```

Written every turn by:
```
backend/src/ask/step7.saveAndRespond.js
  - stateUpdates.currentTopicId = nextTopicSignal.topicId        (on NEXT_STEP advance)
  - stateUpdates.completedTopicIds = [...prev, chatState.currentTopicId]
```

Read every turn by:
```
backend/src/ask/step5.retrieveContent.js → getNextTopic(chatState.currentChapterId, chatState.currentTopicId)
backend/src/curriculum/nextTopicResolver.js
```

Sent to frontend as part of the ask response:
```
backend/src/ask/step7.saveAndRespond.js → buildSessionPayload()
  session.currentTopicId, session.completedTopicIds
```

### System B — Cross-session progress (`ChapterProgress` collection)

Lives in its own MongoDB collection `chapter_progress`, one document per **(user × chapter)** — survives across many chat sessions, meant to be the "student's real progress on this chapter over time."

```
backend/src/models/chapterProgress.model.js
backend/src/services/chapterProgress.service.js
backend/src/controllers/chapterProgress.controller.js
backend/src/routes/chapterProgress.routes.js

Fields: status, currentTopicId, completedTopicIds, totalCoreTopics,
        progressPercent, topicEngagement[], linkedSessionIds[], ...
```

Written every focus turn by:
```
backend/src/ask/step7.saveAndRespond.js (lines 254-295)
  upsertChapterProgress(userId, guestId, chapterId, { currentTopicId, completedTopicIds, ... })
  markChapterComplete(...) on CHAPTER_COMPLETE
```

Read by:
```
FocusModal "Jahan Chhoda Tha" section  → GET /api/v1/chapter-progress (list)   → useChapterProgress hook
chapterProgress.controller.js recommendation object (built, but NOT currently wired to frontend welcome message)
```

### The bridge between them (and where it breaks)

```
backend/src/ask/step2.loadSession.js (lines 70-112)
```
On a **new session**, if the student re-enters a chapter they've studied before, this step is supposed to copy System B's progress → System A's `chatState`, so the NEXT_STEP resolver picks up where they left off. This copy step is where BUG-1 happens (see below).

### Frontend consumers of these two systems

```
frontend/src/pages/ChatPage.jsx
  - Local state completedTopicIds/currentTopicId  ← mirrors System A only (from ask response session payload)
  - handleFocusChapterSelect() resets both to [] / null on every chapter selection

frontend/src/components/FocusProgressHeader.jsx
  - Computes "Topic X of Y" and %  purely from System A's local state + useChapterTopics(chapterId)
  - Has NO knowledge of System B (chapterProgress) at all

frontend/src/components/FocusModal.jsx
  - "Jahan Chhoda Tha" cards  ← reads System B only, via useChapterProgress hook

frontend/src/hooks/useChapterTopics.js   → GET /study-map/chapters/:id/topics  (all core topics, no progress)
frontend/src/hooks/useChapterProgress.js → GET /chapter-progress (list, System B, 30s cache)
```

**This is the core problem in one sentence: the modal shows System B's number, the header shows System A's number, and System A is reset to zero on every chapter (re-)selection while System B is not — so they disagree by design, not by accident.**

---

## CONFIRMED BUGS (verified in code, not guessed)

---

### BUG-1 `[ ]` Cross-session resume is completely broken (topic pointer wiped on every focus-session start)

**Severity: CRITICAL — breaks the core "Zuno remembers" promise entirely.**

**Where:** `backend/src/ask/step2.loadSession.js`, lines 76–100.

**What happens, step by step:**
```js
// Line 76-86: correctly loads System B's progress and copies it into chatState
if (studyMode === 'focus' && focusChapter?.id) {
  chapterProgress = await getChapterProgress(userId, guestId, focusChapter.id);
  if (chapterProgress && chatState.isNewSession) {
    chatState.currentTopicId    = chapterProgress.currentTopicId;   // e.g. "...topic-05"  ✅ correct so far
    chatState.completedTopicIds = chapterProgress.completedTopicIds || [];
  }
}

// Line 89-100: runs immediately after, in the SAME function call
if (studyMode === 'focus' && focusChapter) {
  const isChapterSwitch = chatState.currentChapterId !== focusChapter.id;
  // chatState.currentChapterId is STILL the schema default `null`
  // (this is a brand-new session — nothing has set currentChapterId yet)
  // focusChapter.id is e.g. "science.biology.chapter-02"
  // null !== "science.biology.chapter-02"  →  TRUE, always, on every new session

  chatState.currentChapterId = focusChapter.id;

  if (isChapterSwitch) {
    chatState.currentTopicId = null;   // ❌ wipes the value we just restored 10 lines above
  }
  ...
}
```

**Why it happens:** `isChapterSwitch` is computed by comparing `chatState.currentChapterId` (which is always `null` for a new session, because `handleFocusChapterSelect` in the frontend deliberately starts a **new session** on every chapter pick — see BUG-2) against the newly selected chapter. Since it's a new session, this comparison is *always* true, regardless of whether the student is truly switching chapters or resuming the same one. The chapter-switch-detection logic that STEP-3 of the old master plan added (to solve a *different*, legitimate problem — mid-session chapter switching) is now firing on a case it was never designed for: brand-new sessions.

**Consequence:** `getNextTopic(chapterId, null)` in `nextTopicResolver.js` always returns `coreTopics[0]` — the very first topic — no matter how far the student had gotten previously. Every time a student closes the app and comes back (or clicks "New Chat" then re-enters the same chapter, which is the *only* way to re-enter a chapter — see BUG-2), they are forced back to Topic 1. `completedTopicIds` is restored correctly (so the progress bar shows partial %), but `currentTopicId` is not — so the pointer and the bar visibly disagree, which is exactly the "5% shown, then 0%, resets to topic 1" behavior you saw.

**Impact:** Every returning student loses their place. This makes the entire progress-tracking feature (STEP-2, STEP-3, STEP-7 of the old plan) functionally pointless for anyone who doesn't finish a chapter in one sitting — which, given BUG-3 (huge topic counts), is nearly everyone.

**Fix direction (to discuss, not decided):** The chapter-switch detection needs a way to distinguish "genuinely new session, restore from System B" from "same session, chapter actually changed." Options to weigh when we get to this step:
- (a) Only apply the wipe-on-switch rule when `!chatState.isNewSession` (mid-session switches only — new sessions always trust the System-B restore).
- (b) Reorder: do the switch-detection BEFORE the cross-session restore, so restore always wins on a new session.
- (c) Bigger picture: this bug is a symptom of maintaining two separate "current chapter" fields with unclear precedence — worth deciding once and for all which system owns "truth" during session load (ties into the Architecture Decision below).

---

### BUG-2 `[ ]` Chapter re-selection always nukes local progress state to zero, and always forces a new session

**Severity: HIGH — directly causes the "5%→0%" visual bug you saw, and structurally prevents BUG-1 from ever being fixed while it stands as-is.**

**Where:** `frontend/src/pages/ChatPage.jsx`, `handleFocusChapterSelect` (lines 252–279).

```js
const handleFocusChapterSelect = (chapterId) => {
  const nextChapter = findChapterById(chapterId);

  if (messages.length > 0) {
    clearSessionId();
    setSessionId('');
    setMessages([]);
    setCompletedTopicIds([]);   // ❌ local progress zeroed immediately, before any network call
    setCurrentTopicId(null);
    ...
  }

  setSelectedChapterId(chapterId);
  setStudyMode(STUDY_MODES.focus);
  ...
};
```

**Why it happens:** This code path exists to prevent an *invalid* state — converting an already-active **global** session into a **focus** session (sessionType is immutable after turn 1, by design, per the old plan's system context notes). But the guard is too broad: it fires on **every** chapter selection when there are existing messages, including selecting a chapter the student has *already made progress in*. The result: the moment you tap a chapter in FocusModal, the UI immediately shows 0% / Topic 1, and only gets corrected once the backend responds to the first message (auto "Shuru karo" from STEP-6 of the old plan) — but as BUG-1 shows, even that response comes back wrong because the resume itself is broken server-side.

**Impact:** Even if BUG-1 is fixed, the frontend will still show a jarring "reset to zero" flash before the corrected numbers arrive from the network, because it optimistically zeroes state instead of waiting for/trusting the fetched cross-session progress.

**Fix direction (to discuss):**
- (a) When selecting a chapter that has existing `ChapterProgress` (i.e. it appeared in "Jahan Chhoda Tha" or has any prior record), pre-seed `completedTopicIds`/`currentTopicId` from that data immediately (FocusModal already has this data loaded via `useChapterProgress` — it's currently discarded after rendering the picker cards).
- (b) Reconsider whether every chapter selection needs a brand new session at all — ties into the Architecture Decision below (should chapter progress be the session-independent source of truth, making the session reset harmless?).

---

### BUG-3 `[x]` Topic granularity is unusably fine — chapters have 11 to 59 "core" topics

**Severity: CRITICAL for product experience — makes the whole progress bar/roadmap feature feel broken even when the plumbing is correct.**

**Verified directly from `backend/storage/curriculum-index.json`** (counted every topic with `role: 'core'` per chapter):

| Chapter | Core topics |
|---|---|
| Light — Reflection and Refraction | 37 |
| Human Eye and Colourful World | 33 |
| Electricity | 13 |
| Magnetic Effects of Electric Current | 24 |
| Sources of Energy | 25 |
| Our Environment | 25 |
| Management of Natural Resources | 11 |
| Chemical Reactions and Equations | 15 |
| Acids, Bases and Salts | 32 |
| Metals and Non-metals | 37 |
| Carbon and Its Compounds | 20 |
| Periodic Classification of Elements | 16 |
| Life Processes | 30 |
| **Control and Coordination** | **42** |
| **How Do Organisms Reproduce?** | **59** |
| Heredity and Evolution | 45 |

**Why it happens:** `getChapterCoreTopics()` (`backend/src/curriculum/topicResolver.js`, line 106) simply filters the curriculum index for `role === 'core'` and returns all of them, in order. The curriculum index itself (built by `curriculumIndexBuilder.js` from markdown headings) tagged far too many fine-grained headings as `core` rather than `subtopic` — e.g. a chapter like Reproduction, which conceptually has maybe 6-10 teachable units, was split into 59 heading-level "core" entries.

**Impact:**
- "Topic 1 of 42" is demoralizing and makes Focus Mode feel tedious, not motivating — the opposite of the intended effect (STEP-7 of the old plan was explicitly about making progress "feel meaningful and goal-oriented").
- Each "aage badhao" only moves the bar by ~2%, so a student doing real, substantial learning sees almost no visible progress for a long time — likely to make them think the feature is broken or pointless.
- `getNextTopic` teaches one heading-level fragment at a time (e.g. sub-sub-headings), which may already read awkwardly as a single "lesson" in the tutor's response — worth checking prompt output quality too, not just the counter.

**Fix direction (to discuss — this is a content/data problem, not just code):**
- (a) Re-tag the curriculum index: promote only genuinely major conceptual units to `role: 'core'`, demote the rest to `subtopic`/`revision` (already exist as roles, just underused for grouping). Requires either re-running `curriculumIndexBuilder.js` with better heading-detection rules, or manually curating `role` per topic.
- (b) Keep the granular topics as `NEXT_STEP` teaching units (so per-turn content stays detailed), but decouple the "progress bar" unit from the "teaching" unit — e.g. group topics into a smaller number of "milestones" purely for display purposes, without touching how content is taught.
- (c) Hybrid: pick one canonical grouping level ("core" but tightened) and use it for both teaching pace and progress display, accepting we may need to touch the source markdown/index-builder logic.

This will need its own focused sub-discussion when we reach it — likely the most content-heavy step in this file.

---

### BUG-3 — IMPLEMENTATION + VERIFICATION NOTES (2026-07-08/09)

**Decision made after deep discussion (chose option (a)/(c) hybrid, rejected a separate display-only grouping layer):**

Investigated the actual root cause before choosing a fix: `markdownChunker.js`'s section-merge logic *already* silently merges small adjacent headings into one physical embedding chunk (e.g. "Testes"/"Sperm"/"Vas Deferens" were already being merged into a neighboring chunk during embedding) — while `curriculumIndexBuilder.js`'s `role` tagging treated each of those same headings as an independent "core" topic. **These two pipelines already disagreed with each other on the same markdown file** — a third instance of the "two systems, no shared truth" anti-pattern (after `chatState` vs `ChapterProgress` in BUG-1). A bolt-on `milestones.json` overlay (the originally-considered "separate display-grouping layer") would have created a *fourth* disagreeing system, so it was rejected in favor of fixing the actual source of truth: the markdown heading hierarchy itself.

Also found and rejected as unnecessary: `EMBEDDING_PROVIDER=openai` (not Gemini as CLAUDE.md states — docs are stale) makes full re-embedding cheap and fast (~10-15 min), removing the original cost concern against touching source content.

**Fix:** Restructured heading levels (and only heading levels/number-prefixes — zero prose/content changes) across the 11 worst-offending chapters so genuinely major concepts stay `##` (H2, `role: core`, walked by `nextTopicResolver`) and their sub-details nest under them as `###`/`####` (`role: subtopic`, folded into the parent's chunk instead of counted separately). Built a small reusable script, `backend/scripts/apply-heading-restructure.js`, that applies a JSON list of exact heading-line replacements to one file, verifying every "from" line matches exactly once and the total heading count is unchanged before writing (aborts with no partial writes on any mismatch) — used instead of one-off manual edits given the scale (11 files, ~300 heading-line changes total).

**Files changed (content, not code):**
```
data/class-10/science/biology/chapter-03-how-do-organisms-reproduce.md      59 → 12 core topics
data/class-10/science/biology/chapter-04-heredity-and-evolution.md         45 → 12
data/class-10/science/biology/chapter-02-control-and-coordination.md       42 → 12
data/class-10/science/physics/chapter-01-light-reflection-and-refraction.md 37 → 9
data/class-10/science/chemistry/chapter-03-metals-and-non-metals.md        37 → 13
data/class-10/science/physics/chapter-02-human-eye-and-colourful-world.md  33 → 10
data/class-10/science/chemistry/chapter-02-acids-bases-and-salts.md        32 → 13
data/class-10/science/biology/chapter-01-life-processes.md                 30 → 11
data/class-10/science/physics/chapter-05-sources-of-energy.md              25 → 13
data/class-10/science/physics/chapter-06-our-environment.md                25 → 12
data/class-10/science/physics/chapter-04-magnetic-effects-of-electric-current.md 24 → 12
```
Chapters left untouched (already reasonable): Electricity (13), Chemical Reactions and Equations (15), Periodic Classification of Elements (16), Carbon and Its Compounds (20), Management of Natural Resources (11).

**New file:** `backend/scripts/apply-heading-restructure.js` (reusable for any future re-grouping work — the per-chapter JSON specs used to drive it were scratch files, deleted after each chapter was verified).

**No code changes** — `curriculumIndexBuilder.js`, `nextTopicResolver.js`, `markdownChunker.js` all worked correctly once given correctly-nested input; this was a pure content fix, exactly per the "prefer fixing the real source of truth over patching around it" working-style rule at the top of this file.

**Verified (2026-07-08/09):**
1. `npm run curriculum:build` after each chapter — confirmed exact designed core-topic count and correct titles/order for all 11 chapters.
2. `test:curriculum-resolvers`, `test:next-topic-resolver` — pass (dynamic assertions, unaffected).
3. `test:chunks` — same 3 failures as *before* any change (confirmed via `git stash` on the original files) — a pre-existing `curriculum:build`-unrelated chapter-count mismatch (16 vs 17, from an already-existing "meta/Science Introduction" chapter) and a pre-existing lazy-vs-normal chunker count mismatch. Neither caused by this work.
4. `npm run rag:index` (full re-embed, OpenAI `text-embedding-3-large`, 628 chunks) — ran clean; confirmed live in MongoDB (`chunks` collection) that content previously mis-grouped under a neighboring heading (e.g. "Testes"/"Sperm"/"Vas Deferens" were silently merged into the "Changes in Boys During Puberty" chunk before this fix) now correctly appears under `heading_path: "... > 39. Male Reproductive System > ..."`.
5. Reset 3 `chapter_progress` documents whose stored `currentTopicId` no longer resolves to the same concept after restructuring (topicIds are order-based, so numbering shifted): Life Processes (userId `6a301eb...`, was 7%), Control and Coordination (same user, was 7%; and one guest doc, was 2%) — cleared to `currentTopicId: null, completedTopicIds: [], progressPercent: 0` so next visit starts clean rather than pointing at the wrong topic. Chapters not restructured (Electricity, Chemical Reactions) were left untouched — confirmed no `chapter_progress` docs referenced any other restructured chapter.

**Side effects discovered and accepted as correct, not bugs:**
- A handful of chapters (Metals and Non-metals, Human Eye, Sources of Energy, Our Environment, Magnetic Effects) use `# N. Title` (H1) as their main structure with unlabelled `role: chapter` status — meaning some of their sub-topics (e.g. Human Eye's "9. Why Is the Sky Blue?", "10. ...Sunset?", "11. ...Danger Signals Red?") had **zero** core children and were **never reachable by NEXT_STEP at all** before this fix. Restructuring these chapters' H1 sections into H2 anchors fixed this invisible-content gap as a natural side effect, not a separate bug hunt.
- One cosmetic-only, non-blocking gap noted but not fixed (out of scope for BUG-3): `markdownChunker.js`'s section-merge logic keeps only the *first* heading's `heading_path` when merging several small adjacent sections into one chunk — meaning a merged chunk's displayed context path can undercount how many original headings it actually covers. Does not affect `role` classification or NEXT_STEP correctness (verified); worth a look if `[Context]` header precision for the tutor LLM ever becomes a problem.

**Not yet done:** ISSUE-1 (`completedTopicIds` only grows via NEXT_STEP) and ISSUE-2 (`FocusProgressHeader`'s guesswork fallback) are next in this file.

---

## ARCHITECTURE DECISION — ✅ DECIDED (2026-07-06)

**Decision: `ChapterProgress` becomes the single source of truth for all topic-level progress (`currentTopicId`, `completedTopicIds`). `ChatSession.chatState` no longer stores these fields at all — removed from schema, not just deprecated.**

`chatState` keeps `currentSubjectId`/`currentSectionId`/`currentChapterId` (genuinely session-scoped — "what is this thread about," used for session restore/routing) but never duplicates topic-level progress again.

**Reasoning:**
- No production data exists yet (app hasn't deployed) — zero migration risk to remove fields now. This is the correct, and cheapest, time to do this.
- `chapterProgress.service.js` already has Redis caching (60s TTL) built in and barely used — reading it every focus turn instead of only on new-session is practically free.
- `guestId` is stable in `localStorage` (`frontend/src/services/axios/axiosInstance.js`), so this works for guests too, not just logged-in users — confirmed by code read, not assumed.
- This structurally eliminates the entire "which copy do I trust" bug category — including for multi-device/multi-tab use (phone → laptop resume works automatically, no extra code needed) — rather than patching today's specific ordering bug.
- A GET endpoint already exists (`chapterProgress.controller.js` → `getChapterProgressController`) that returns progress + topics + a ready-made "recommendation" object (resume message + chips) — currently unused by the frontend. This decision means we finally wire that up, fixing BUG-2's "flash to 0%" as a side effect instead of a separate patch.

**Two follow-up decisions locked at the same time:**
- Schema cleanup: **remove** `currentTopicId`/`completedTopicIds` from `ChatSession.chatState` entirely (not kept as unused/vestigial).
- Revise flow (ties to ISSUE-3): re-studying a `completed` chapter starts a **fresh revision pass** — `currentTopicId`/`completedTopicIds`/`progressPercent` reset to 0, status becomes `'revising'`, but `completedAt` (the original completion fact) is preserved, not nulled. Note: today's `resetChapterProgress()` in `chapterProgress.service.js` nulls `completedAt` — it does NOT currently satisfy this requirement as-is and will need a small adjustment when we get to ISSUE-3/the revise-wiring work.

**Confirmed downstream consumers that will need updating (traced via code, not guessed):**
```
backend/src/models/chatSession.model.js      — remove currentTopicId/completedTopicIds fields
backend/src/ask/step7.saveAndRespond.js      — ALLOWED_STATE_FIELDS list, stateUpdates writes,
                                                buildSessionPayload() (session.currentTopicId/completedTopicIds)
backend/src/ask/step2.loadSession.js         — remove restore-then-wipe logic entirely (moot once
                                                chatState has no topic fields); always load chapterProgress
                                                (not just on new session)
backend/src/ask/step5.retrieveContent.js     — NEXT_STEP branch: getNextTopic() must read currentTopicId
                                                from session.chapterProgress, not chatState
backend/src/controllers/session.controller.js — getSessionHistory(): sessionMeta.currentTopicId/
                                                completedTopicIds currently read from chatState (lines
                                                108-110) — must switch to a ChapterProgress lookup
frontend/src/pages/ChatPage.jsx              — handleFocusChapterSelect() must stop zeroing progress
                                                locally; ask-response handler must read
                                                payload.chapterProgress.* (already sent! step7 already
                                                returns this object, just unused for this purpose today)
                                                instead of payload.session.currentTopicId/completedTopicIds
```

**Consumers checked and confirmed SAFE / no functional change needed (verified 2026-07-06, not assumed):**
```
backend/src/prompts/intents/nextStepPrompt.js  — only a doc comment ("backend manages this field") — cosmetic only
backend/src/prompts/tutorPrompt.js             — legacy (non-intent-router) path only, read-only informational
                                                  text in the prompt, never consumed for control flow
backend/src/ask/promptHelpers.js               — formatMemoryForPrompt() output (context.memory) is computed
                                                  in step3.buildContext.js but never actually passed into the
                                                  decider prompt call in step4 — dead output today, zero risk
backend/src/curriculum/nextTopicResolver.js     — takes currentTopicId as a plain function argument, doesn't
                                                  care where the caller sourced it from — already decoupled
```

**⚠️ Hidden risk found during re-review (2026-07-06) — now folded into the plan, not a reason to abandon it:**

Today, `ChapterProgress` and `chatState` are both written every turn — if the `ChapterProgress` write ever fails (`upsertChapterProgress` in step7, currently `.catch(() => null)` at line 281, silently swallowed), `chatState`'s redundant copy still has the correct pointer. **Once `chatState`'s copy is removed, this redundancy is gone** — a silent write failure means next turn's `getNextTopic()` won't see the advance.

Traced the actual worst case: the *current* turn's answer is already generated and sent before this write happens, so a failure here does **not** lose the student's answer or crash anything — it only means the *next* turn re-teaches the same topic once (mildly repetitive, not data loss). Still, this is a real new failure mode introduced by removing redundancy, and it must be hardened, not ignored:

**Added to BUG-1's implementation scope:** `upsertChapterProgress()` call in step7 gets one bounded retry on failure, and if it still fails, logs at a distinctly visible error level (not the current silent swallow) so this is monitorable in production instead of invisible.

**Second re-review (2026-07-06, after Farhan asked to rethink again) — 2 more real gaps found:**

1. **Read-side failure blast radius increased.** `getChapterProgress()` in `chapterProgress.service.js` (line 87) has the Redis read wrapped safely, but the underlying `ChapterProgress.findOne(...)` Mongo call is **not** wrapped in try/catch — if it throws, it propagates uncaught. Today this read only runs on new sessions, so a transient failure has a small blast radius. This plan makes the read run on **every** focus turn — meaning an unhandled failure here would now break every single focus-mode turn instead of just session-starts. **Fix added:** wrap this call in step2 with try/catch; on failure, log clearly and continue with `chapterProgress = null` (graceful degrade — self-healing on the next successful read/write, no permanent data loss since the underlying Mongo document is untouched).

2. **Only one of the two ChapterProgress writes was hardened.** `step7.saveAndRespond.js` writes to `ChapterProgress` in two places — `upsertChapterProgress()` (hardened above) and `markChapterComplete()` (line 264) — both currently use the same silent `.catch(() => null)` pattern. A failed `markChapterComplete()` doesn't break the teaching loop (chapter-complete detection is computed live from `nextTopicResolver`, not read from `ChapterProgress.status`), but it does leave `chapterProgress.status`/`progressPercent` stale — meaning FocusModal's "Jahan Chhoda Tha" list and the revise-flow recommendation (BUG-2 scope) would show incorrect state. **Fix added:** a single shared `withRetry(fn, label)` helper (one retry, ~200ms delay before retrying, clear error logging on final failure) used by **both** writes — and designed to be reused later by the revise/reset actions in BUG-2, so this hardening pattern isn't duplicated three separate times across the codebase.

**Known limitation — accepted, not silently ignored:** Two tabs/devices for the same user hitting NEXT_STEP on the same chapter within the same instant could race (`upsertChapterProgress`'s `$set` is last-write-wins, no compare-and-swap). This risk **already existed** before this plan (not introduced or worsened by it). Full fix requires optimistic concurrency (a version field + conditional update) — judged disproportionate effort for the realistic likelihood (a single student issuing the same action from two devices in the same second). Documented here so it's a conscious tradeoff, not a hidden gap.

---

## PRODUCT-LEVEL GAP FOUND DURING DISCUSSION — Focus-entry message/chips ignore real progress

Raised directly by Farhan during discussion (2026-07-06): even once the progress % is accurate, showing the **same generic "Chapter shuru karein" pills** every time a chapter is (re-)selected — regardless of whether the student already made progress — is confusing and incomplete. If a student did 5% and comes back, they should see a resume-oriented message, not a "start fresh" one.

**Root cause:** `frontend/src/pages/ChatPage.jsx` → `createFocusMessage()` (lines 69-79) is fully static — always the same text, always the same 2 chips, regardless of chapter state.

**What already exists and is unused:** `backend/src/controllers/chapterProgress.controller.js` → `buildRecommendation()` (lines 31-82) already computes exactly the right message + chips per state:
- Not started → "Chalo shuru karte hain! Pehla topic hai 'X'." + chips: `next_step` (Shuru karo), `chapter_overview` (Pehle overview do)
- In progress → "Wapas aaye! 'X' tak pahuche the — wahan se chalein?" + chips: `next_step` (Haan wahan se chalein), `next_step` (Topic 1 se fresh), `roadmap` (Roadmap dikhao — N/total done)
- Completed → "Tune pehle complete kar liya hai! Revision karein ya agla chapter?" + chips: `revise_chapter`, `switch_chapter`
- Revising → "Revision mode — kahan se shuru karein?" + chips: `next_step` x2

This endpoint (`GET /api/v1/chapter-progress/:chapterId`) is fully built and working — it's simply never called by the frontend for this purpose. This closes the loop between "what % is shown" and "what the student is told to do next" — and folds the old plan's **ISSUE-3** (unused reset/revise UI) into this same fix, since it's the same root gap.

**Added to BUG-2's implementation scope:**
1. `handleFocusChapterSelect()` calls `GET /chapter-progress/:chapterId` and builds the focus-entry message from `recommendation.message` + `recommendation.chips`, instead of the static `createFocusMessage()`.
2. `handleSuggestedAction()` needs two new cases that don't exist today:
   - `revise_chapter` — must call the backend reset/revise action (`POST /chapter-progress/:chapterId/action`), honoring the earlier decision (fresh reset, `completedAt` preserved) — not just send a text question.
   - `roadmap` — should be a pure frontend action (expand/open the already-loaded `FocusProgressHeader` topic list) — must NOT be sent as a question to the LLM pipeline, since it isn't a real academic question and could get misclassified.
3. **Flag to verify during implementation:** the recommendation chip labels ("Haan, wahan se chalein", "Topic 1 se fresh shuru") need to reliably classify as `NEXT_STEP` intent in the decider. If they don't, a small decider-prompt example addition will be needed (same pattern as the old plan's STEP-9 fix for "Shuru karo").

---

### BUG-1 — IMPLEMENTATION + VERIFICATION NOTES (2026-07-06)

**Files changed:**
- `backend/src/models/chatSession.model.js` — removed `currentTopicId`/`completedTopicIds` from `chatState` schema.
- `backend/src/ask/step2.loadSession.js` — `chapterProgress` now loaded unconditionally every focus turn (try/catch, graceful `null` fallback on read failure); removed the restore-then-wipe block entirely.
- `backend/src/ask/step5.retrieveContent.js` — NEXT_STEP branch reads `currentTopicId` from `chapterProgress`, not `chatState`.
- `backend/src/ask/step7.saveAndRespond.js` — added shared `withRetry()` helper (1 retry, 200ms delay, visible error log on final failure); both `upsertChapterProgress()` and `markChapterComplete()` now use it; `ALLOWED_STATE_FIELDS` and `buildSessionPayload()` no longer reference the removed fields; new `currentTopicId`/`completedTopicIds` computed from prior `chapterProgress` + `nextTopicSignal` instead of `chatState`.
- `backend/src/controllers/session.controller.js` — `getSessionHistory()` now looks up `ChapterProgress` (try/catch, non-fatal) instead of reading from `chatState`.
- `backend/src/ask/promptHelpers.js` — trivial cleanup of dead fields in `formatMemoryForPrompt()`.

**Verified (2026-07-06):**
1. Syntax-checked all edited files (`node --check`) — clean.
2. Ran `test:study-map`, `test:vector-store`, `test:curriculum-resolvers` — all pass. (`test:chunks` and `test:chat-db-models` have pre-existing unrelated failures — confirmed via `git status` showing zero diff in the files those tests cover — not touched by this fix.)
3. **End-to-end regression test against the running backend** (real MongoDB + Redis, synthetic guestId, direct API calls to isolate from the frontend's guest-turn-limit UI):
   - Turn 1 (new session, fresh chapter): correctly started at the first core topic ("Need for Control and Coordination").
   - Turn 2 (same session, "Aage badhein"): correctly advanced to the second core topic.
   - Turn 3 (**brand-new session** — simulates "New Chat" + reselecting the same chapter, same guestId): correctly resolved to the **third** core topic ("Animal Nervous System") — continuing from where turn 2 left off, **not** restarting at topic 1. This is the exact bug from the original screenshot report.
   - Confirmed directly in MongoDB: `chapter_progress` doc has `completedTopicIds: [topic-03, topic-04]`, `currentTopicId: topic-05`, `linkedSessionIds` containing both session IDs, `progressPercent: 5` (2/42) — all correct.
   - Confirmed directly in MongoDB: both `chat_sessions` documents have **no** `currentTopicId`/`completedTopicIds` keys in `chatState` at all — schema removal took effect.
   - Test data cleaned up after verification (synthetic guestId's `chapter_progress` doc and both `chat_sessions` docs deleted).
4. Also fixed an unrelated pre-existing CORS gap surfaced during this test: the preview tooling's dynamic port didn't match the backend's `allowedOrigins` allowlist — not a code bug, just meant testing had to go through the same origin (`localhost:5173`) the backend expects. No code change needed; noted here in case it recurs.

**Not yet done:** BUG-2 (frontend progress-zeroing + resume-message/chips using `buildRecommendation()`) — next up.

---

### BUG-2 — IMPLEMENTATION + VERIFICATION NOTES (2026-07-07)

**Rethought and redesigned before implementing** (per Farhan's request to re-verify the first draft) — found and fixed 3 real problems before writing code:
1. Decider-prompt phrase coverage gap (recommendation labels like "Haan, wahan se chalein" would likely misclassify as GREETING) — solved by decoupling display label from a fixed, already-proven-safe canonical question sent to the backend. No decider/prompt changes needed at all.
2. `buildRecommendation()`'s "revising" branch modeled a scenario ("continue a partial revision") that can never actually occur once reset always nulls `currentTopicId` — simplified to match `not_started`'s shape with distinct wording.
3. Neither existing backend function matched the decided "revise" semantics exactly — generalized `resetChapterProgress()` (added `status` param, stopped nulling `completedAt`) instead of adding a duplicate function; removed the now-dead `markChapterRevising()`.
Also caught: two recommendation chips shared the same `next_step` type despite needing different handling (plain continue vs. reset-then-restart) — gave the restart chip its own type, `restart_topic`.

**Files changed:**
- `backend/src/services/chapterProgress.service.js` — `resetChapterProgress()` generalized (status param, completedAt never touched); `markChapterRevising()` removed.
- `backend/src/controllers/chapterProgress.controller.js` — action controller passes `status` through (validated against an allowlist); `mark_revising` case removed; `buildRecommendation()`'s revising branch simplified; in_progress branch's 2nd chip changed to `restart_topic` type.
- `frontend/src/api/tutorApi.js` — `chapterProgressAction()` generalized to accept arbitrary extra body fields.
- `frontend/src/pages/ChatPage.jsx` — `handleFocusChapterSelect()` now async: fetches `GET /chapter-progress/:chapterId`, builds the welcome message from `recommendation.message`/`chips` (falls back to the old static message on fetch failure), staleness-guarded against rapid chapter/mode switching. `handleSuggestedAction()` gained `next_step`/`chapter_overview` (canonical-phrase ask), `restart_topic`/`revise_chapter` (reset-then-ask), `roadmap` (pure client-side message, no backend/LLM call) cases. Also fixed a carry-over bug from BUG-1: the ask-response handler was still reading `payload.session.completedTopicIds/currentTopicId` (removed in BUG-1) instead of `payload.chapterProgress.*` — this was silently keeping the progress header frozen even after BUG-1 shipped.

**Verified (2026-07-07), end-to-end against the running app:**
1. `npm run build` (frontend) — clean. Backend files syntax-checked — clean.
2. Fresh chapter (never studied): entry message correctly read *"Chalo shuru karte hain! Pehla topic hai '1. What Are Life Processes?'."* with chips "Shuru karo"/"Pehle overview do" — not the old generic static text.
3. Clicking "Shuru karo" sent the canonical "Chapter shuru karein" as the actual question (confirmed in the student message bubble) regardless of the chip's own label — decider never saw the display copy.
4. Returning to an in-progress chapter: entry message correctly read *"Wapas aaye! '2. Nutrition' tak pahuche the — wahan se chalein?"* with `next_step`/`restart_topic`/`roadmap` chips, and the progress header showed the correct topic/% **immediately on chapter selection**, before any ask.
5. "Roadmap dikhao" — confirmed **zero network calls** to `/ask`; rendered a windowed topic list (✅ done / 🟢 current / 🔒 locked) built purely from already-loaded client state. Caught and fixed a bug here: initially showed everything locked because `handleFocusChapterSelect` wasn't syncing `completedTopicIds`/`currentTopicId` local state from the fetched progress (only used it for the message) — fixed, re-verified correct icons after the fix.
6. "Topic 1 se fresh shuru" (`restart_topic`) — confirmed via MongoDB: `currentTopicId`/`completedTopicIds`/`progressPercent` reset, `status` stayed `'in_progress'`, then correctly re-taught topic 1.
7. `revise_chapter` flow — verified directly via API calls (simulating a completed chapter rather than grinding through 30 real topics): reset-with-`status=revising` correctly set `status: 'revising'`, cleared `currentTopicId`/`completedTopicIds`/`progressPercent`, and **preserved the original `completedAt` timestamp** exactly as decided. Follow-up `GET` correctly returned the simplified revising recommendation ("Revision shuru! Pehla topic hai...").
8. Test data cleanup: synthetic guestId's `chapter_progress` doc and a session accidentally polluted by a test mistake (wrong localStorage key) were deleted; confirmed Farhan's own real progress data (`Control and Coordination: 2%`, `Electricity: 0%`) was untouched throughout.

**Follow-up fix found via Farhan's live real-account testing (2026-07-07, after commit):** Clicking "Haan, wahan se chalein" (continue mid-chapter) sent the canonical phrase "Chapter shuru karein" — same as the genuine "start chapter" case, because both shared `type: 'next_step'`. Verified with matched terminal logs + MongoDB before/after (`Control and Coordination`, real userId `6a301eb...`): the backend correctly advanced topics either way (NEXT_STEP always resolves from `chapterProgress.currentTopicId`, independent of phrasing) — so this was a **display/trust bug, not a data bug**. Still worth fixing: the student's own message shouldn't misleadingly read "start" when they clicked "continue". Fix: gave the in_progress branch's first chip its own type, `continue_step`, mapped to "Aage badhao" (decider's first NEXT_STEP example) instead of "Chapter shuru karein". Files: `backend/src/controllers/chapterProgress.controller.js`, `frontend/src/pages/ChatPage.jsx`. Verified live on Farhan's own running dev server + real account: chip now sends "Aage badhao" and correctly advances (Topic 3 → Topic 4, 42-topic chapter).

**Not yet done:** BUG-3 (topic granularity — chapters ranging 11 to 59 core topics) is the next item in this file.

---

## SECONDARY ISSUES (real, but not core-breaking — fix after the above)

### ISSUE-1 `[ ]` `completedTopicIds` only grows via NEXT_STEP intent
If a student asks concept questions/doubts instead of tapping "aage badhao", no topic is ever marked complete, so the bar can under-represent real learning. Was flagged as a known limitation in the old plan (STEP-7) but becomes much more visible once BUG-3's granularity is fixed (large jumps in %, then long flat stretches).

### ISSUE-2 `[ ]` `FocusProgressHeader`'s `currentIndex` fallback is guesswork
`frontend/src/components/FocusProgressHeader.jsx` lines 20–27: if `currentTopicId` isn't found in the topics list (which will happen constantly given BUG-1), it falls back to either "index 0" or "chapter complete" based purely on whether `completedTopicIds` is empty — not an actual signal of chapter completion state. Should read the real `status` field from `ChapterProgress` instead of inferring it.

### ISSUE-3 `[ ]` `reset-chapter` / "revise" backend actions exist but are unreachable from the UI
`chapterProgress.controller.js` has working `reset` and `mark_revising` actions (POST `/api/v1/chapter-progress/:chapterId/action`) and `buildRecommendation()` already generates the right chips text for a completed/revising chapter — but nothing in the frontend calls this endpoint or renders `recommendation.chips`. This is finished backend work sitting unused; once the architecture decision is made, wiring this up may become the actual fix for "restart a completed chapter" (previously STEP-16 in the old plan).

---

## EXECUTION LOG

| Step | Status | Date Started | Date Done | Notes |
|------|--------|---------------|------------|-------|
| ARCHITECTURE DECISION | `[x]` | 2026-07-06 | 2026-07-06 | ChapterProgress = single source of truth; chatState fields removed; fresh revision reset (completedAt preserved) |
| BUG-1 (resume wiped) | `[x]` | 2026-07-06 | 2026-07-06 | Implemented + verified end-to-end (see notes below) |
| BUG-2 (frontend zeroing) | `[x]` | 2026-07-06 | 2026-07-07 | Implemented + verified end-to-end (see notes below). Absorbed ISSUE-3. |
| BUG-3 (topic granularity) | `[x]` | 2026-07-08 | 2026-07-09 | 11 chapters restructured (H2/H3 heading regroup, no prose changes), `rag:index` re-embedded, 3 stale progress docs reset. See notes below. |
| ISSUE-1 (completedTopicIds gaps) | `[ ]` | — | — | After core bugs |
| ISSUE-2 (header fallback guesswork) | `[ ]` | — | — | After core bugs |
| ISSUE-3 (unused reset/revise UI) | `[~]` | 2026-07-06 | — | Folded into BUG-2's fix — same root gap (buildRecommendation unused by frontend) |

---

## OPEN QUESTIONS (pending discussion when we reach that step)

| # | Question | Status |
|---|----------|--------|
| 1 | Which architecture shape (1/2/3 above) do we commit to for progress source-of-truth? | Open |
| 2 | For BUG-3: shrink `core` role at the index level, or add a separate display-grouping layer above teaching-level topics? | Open |
| 3 | Should chapter re-selection ever start a new session, or should focus sessions be resumable directly (select chapter → resume existing session tied to that chapter)? | Open |

---

## NEXT ACTION

Architecture Decision, BUG-1, BUG-2, and BUG-3 are all DONE and verified. Next open items are **ISSUE-1** (`completedTopicIds` only grows via NEXT_STEP intent, not concept-question turns) and **ISSUE-2** (`FocusProgressHeader`'s fallback guesswork when `currentTopicId` isn't found in the topics list). Pick one and open its deep-discussion phase when ready.
