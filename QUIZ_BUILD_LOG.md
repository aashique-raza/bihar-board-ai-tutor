# Quiz System — Build Log

> **Ye living state hai.** Har session ke end mein update hoti hai.
> Rules `QUIZ_EXECUTION_PROTOCOL.md` mein hain · Spec `QUIZ_SYSTEM_BLUEPRINT.md` mein hai
>
> **Ye file hamesha chhoti rahegi.** Purana session history neeche collapse hota jayega.

---

## 📍 ABHI KAHAN HAIN

| | |
|---|---|
| **Current Phase** | **Phase 2** — Quiz Engine & APIs (Backend) — not started |
| **Status** | ✅ **Phase 1 DONE.** 743 real PYQ questions seeded into MongoDB (`question_bank`), 16 chapters, all verified against blueprint counts. Session ends here (Rule 5) — next session starts fresh on Phase 2. |
| **Branch** | `quiz-phase1` (Phase 0: `4b32e34`, Phase 1: `2d51287`, `3ded7ca`, `b4d8072`, `3a0e51b`, `db5b442`) |
| **Last session** | 2026-08-09 — Phase 1 built, verified, seeded |

### ⚠️ Read before starting Phase 2 code

Phase 1 field names deviate from `QUIZ_SYSTEM_BLUEPRINT.md` §5/§12 — the user asked for more
human-readable names during Phase 1's Beat 1 review. **The blueprint text itself was not updated**
(out of scope for a Phase 1 session — updating spec docs is not code). Use this mapping, not the
blueprint's literal field names, when writing Phase 2:

| Blueprint name (§5/§12) | Actual field in code |
|---|---|
| `seedKey` | `questionCode` |
| `options[].key` | `options[].label` |
| `correctAnswer` (Question) | `correctOptionLabel` |
| `shuffledCorrectKey` (Session/Attempt) | `correctOptionLabel` (same name everywhere now) |
| `yearAsked` | `askedInYears` |
| `servedQuestions` | `questions` |
| `submittedAttemptId` | `attemptId` |
| `quizSessionId` (Attempt) | `sessionId` |
| `idempotencyKey` | `submissionKey` |
| `*Snapshot` suffixes (`topicIdSnapshot`) | shortened to just `topicId` (context implies snapshot) |

`userId`, `guestId`, `subjectId`, `chapterId`, `topicId` were **not** renamed — kept matching the
app-wide convention from `chapterProgress`/`studyEvent`. Full field-by-field schema for all 3
models is in this session's history entry below.

### ✅ Baseline (established 2026-08-02, before any Phase 0 code)

| Test | Result |
|---|---|
| `test:chunks` | 🟢 PASS (17/17) |
| `test:study-map` | 🟢 PASS |
| `test:curriculum-resolvers` | 🟢 PASS |
| `test:chat-db-models` | 🔴 RED — pre-existing, unrelated (parked P-6) |
| `test:golden` | 🟢 PASS (100% intent accuracy, 34P/6W/0F) — 2 stale fixture bugs fixed first, see below |

---

## 🎯 PHASE 0 — Definition of Done

> Full analysis: `QUIZ_SYSTEM_BLUEPRINT.md` §7 · Phase spec: §17 Phase 0
> **Ye quiz feature nahi hai** — ye shipped code ka ek bug hai jiske bina quiz gate ban hi nahi sakta.

**Blast radius — sirf ye file:**
- `backend/src/ask/step7.saveAndRespond.js`

**Code:**
- [x] Line ~192: step-5 destructure mein `retrievedContext` add kiya
- [x] Line ~309: `isComplete` ab `retrievedContext === 'CHAPTER_COMPLETE'` test karta hai

**Verify (dekha gaya, maana nahi gaya):**
- [x] Real DB test: chapter ke last topic pe seed karke NEXT_STEP call kiya → `chapter_progress.status` = `'completed'` bana, `progressPercent` = 100
- [x] `study_events` mein `chapter_completed` document confirm hua
- [x] Regression: mid-chapter (first topic pe) NEXT_STEP call kiya → status `'in_progress'` hi raha, `currentTopicId` sahi se agle topic pe advance hua, koi galat `chapter_completed` event nahi bana

**Regression:**
- [x] `test:chunks`, `test:study-map`, `test:curriculum-resolvers` — sab waise hi jaise baseline mein the
- [x] `npm run test:golden` — 33P/7W/0F, 100% intent accuracy (baseline: 34P/6W/0F, same 0 FAIL, same 100%). Fark sirf 1 query PASS→WARN, wo LLM phrasing variance hai, intent bug nahi.

**Bahar — is phase mein ye NAHI karenge:**
- ❌ Koi quiz model / route / seed file — wo Phase 1 hai
- ❌ `awaiting_quiz` status add karna — wo Phase 3 hai
- ❌ `chapterProgress` ka `user_chapter_unique` index bug — 🅿️ parked (P-1)
- ❌ Purane stuck `in_progress` chapters ko retroactively theek karna — grandfathering rule chalega (blueprint §15)

---

## 🎯 PHASE 1 — Definition of Done

> Full plan: `QUIZ_SYSTEM_BLUEPRINT.md` §19 · Phase spec: §17 Phase 1

**Blast radius:**
- `backend/scripts/transform-bulk-to-seed.js` (new)
- `backend/scripts/seed-quiz-bank.js` (new)
- `backend/src/models/question.model.js`, `quizSession.model.js`, `quizAttempt.model.js` (new)
- `data/quiz-bank/science/**/*.json` (16 new seed files)
- `backend/package.json` (`quiz:seed`, `quiz:seed:dry-run`)

**Code:**
- [x] Bulk bank (`data/quiz-bank/bank/questions.json`) brought onto `quiz-phase1` from `quiz-phase0.5-bulk`
- [x] Transform script written — bulk → 16 per-chapter seed files, human-readable field names (see mapping table above)
- [x] 3 Mongoose models written with field names finalized after user review
- [x] Seed engine written — validate (localized text, 4 unique A-D labels, correctOptionLabel matches, real+browsable chapterId, valid topicId if present, no duplicate questionCode) then upsert by questionCode, deactivate anything dropped from seed set

**Verify (dekha gaya, maana nahi gaya):**
- [x] `quiz:seed:dry-run` — 16 files, 743 questions, 0 errors
- [x] `quiz:seed` — 743 inserted, 0 updated, 0 deactivated
- [x] `Question.countDocuments({})` = 743, `isActive: true` count = 743
- [x] `chapterId: 'science.biology.chapter-01'` = 103 (max), `chapterId: 'science.biology.chapter-06'` = 16 (min)
- [x] 16 distinct `chapterId` values in DB
- [x] Sample document shape correct (4 options, `createdBy: 'seed-script'`, timestamps present)

**Regression:**
- [x] `test:chunks`, `test:study-map`, `test:curriculum-resolvers` — same as baseline
- [x] `test:chat-db-models` — same pre-existing red (P-6), unrelated

**Bahar — is phase mein ye NAHI kiya:**
- ❌ Quiz API/routes/controller — Phase 2
- ❌ Koi UI — Phase 4/5
- ❌ Chapter gate / `awaiting_quiz` — Phase 3
- ❌ `explanation`, `topicId`, `difficulty` backfill — data mein nahi hai abhi, sab `null` seeded
- ❌ Redis quiz-cache clearing in seed script (blueprint §12 step 5) — 🅿️ parked (P-7), cache infra khud Phase 2 mein banegi

---

## 🅿️ PARKING LOT

> Yahan sab real cheezein hain. **Koi bhoolegi nahi.** Bas abhi nahi hongi.
> Rule: sirf 🔴 blocker hi turant fix hota hai — baaki sab yahan aata hai.
> Clear kab: phases ke **beech mein**, dedicated session mein.

| # | Kya | Kahan | Mila kab | Priority |
|---|---|---|---|---|
| P-1 | `chapterProgress` ka `user_chapter_unique` index **kuch enforce nahi karta** — field `String` hai par partial filter `$type: 'objectId'` check karta hai, jo kabhi match nahi karega. Matlab logged-in users ke liye per-chapter uniqueness DB level pe hai hi nahi. | `backend/src/models/chapterProgress.model.js:75-82` | 2026-08-02 audit | 🟠 Medium — real bug, par aaj tak visible failure nahi |
| P-2 | `CLAUDE.md` mein chapter counts galat hain — likha hai biology 4 / chemistry 5 / physics 7. Asli: **biology 6 / chemistry 5 / physics 5** (total 16 sahi hai, split galat hai). | `CLAUDE.md` folder structure section | 2026-08-02 audit | 🟢 Low — doc only |
| P-3 | `OUT_OF_CONTEXT` intent `maxTokens: 100` pe chalta hai; ek measured redirect ne 78 output tokens use kiye. Thoda lamba redirect JSON truncate kar sakta hai → parse error → student ko "Thodi technical dikkat aayi". | `backend/src/ask/intentRouter.js` | Hinglish fix investigation | 🟠 Medium — rare par student-facing |
| P-4 | Email provider abhi Nodemailer (SMTP) hai; Render free tier SMTP block karta hai, isliye email verification bypass hai. Resend API pe migrate karna hai. | `backend/src/auth/emailHelpers.js` | `PRE_LAUNCH_BLOCKERS.md` P1 | 🔴 High — par real users se pehle, quiz se independent |
| P-5 | 5 local branches (`logo`, `profile`, `feat/support-page`, `global`, `codex-curriculum-resolvers`) already `main` mein merged hain — sirf local pointer clutter hai, delete kiya ja sakta hai. | git | 2026-08-02 audit | 🟢 Low — housekeeping |
| P-6 | `test:chat-db-models` crash karta hai — `src/models/chatState.model.js` dhundhta hai jo exist nahi karti. Pre-existing (archived `PROBLEMS.md` STB-008 note ke mutabik: `chatState` purane refactor mein `chatSession` ke andar embed hua, script kabhi update nahi hui). Phase 0 baseline mein red mila, isse Phase 0 se unrelated maan ke park kiya. | `backend/scripts/test-chat-db-models.js` | Phase 0 baseline, 2026-08-02 | 🟡 Medium — ek regression test permanently disabled jaisa hai |
| P-7 | Seed script Redis quiz-cache clear nahi karta (`quiz:questions:*`) — blueprint §12 step 5 mein hai, par abhi koi cache key exist hi nahi karti (Phase 2 mein cache layer banegi). User-confirmed deferral. | `backend/scripts/seed-quiz-bank.js` | Phase 1, 2026-08-09 | 🟢 Low — Phase 2 mein cache banate waqt add karna |

**FIXED (baseline setup ke dauraan, Parking Lot mein nahi gaye — turant fix kiye kyunki baseline ko accurately padhna hi Phase 0 shuru karne ki shart thi):**

- **`golden-queries.json` C07** — "Cell membrane ka kya kaam hai?" `CONCEPT_QUESTION` expect karta tha; `data/class-10/science/` mein "cell membrane" ka koi mention hi nahi (Class 9 NCERT topic hai, Class 10 Bihar Board syllabus mein nahi). Decider sahi tha (`OUT_OF_CONTEXT`), test fixture galat thi. `O06` bana ke `OUT_OF_CONTEXT` section mein move kiya, poori reasoning `note` field mein likhi.
- **`golden-queries.json` N01-N04** — `studyMode: "focus"` tha par `chapterId` missing thi. `step1.validateInput.js` Focus Mode ke liye `chapterId` required maanta hai; missing hone par `400 ApiError`, jise `askOrchestrator.js:68-69` `status: 'provider_error'` mein wrap kar deta hai — aur golden-script us status ke liye hamesha "rate limit / LLM unavailable" hardcoded print karta hai, chahe wajah kuch bhi ho. Isi wajah se ye rate-limit jaisa dikha, tha bilkul nahi. Fix: sab 4 mein `chapterId: "science.physics.chapter-01"` add kiya. 4/4 PASS confirm hua.

---

## 🗺️ PHASE BOARD

| Phase | Kya | Status |
|---|---|---|
| **0** | Prerequisite — chapter completion fire karana | ✅ **DONE** (committed on `quiz-phase1`, `4b32e34`) |
| 1 | Question models + seed data (backend) — real 743-Q bank, see §19 | ✅ **DONE** (`quiz-phase1`: `2d51287`, `3ded7ca`, `b4d8072`, `3a0e51b`, `db5b442`) |
| 2 | Quiz engine + APIs (backend) | ⚪ Pending |
| 3 | Chapter gate integration (backend) | ⚪ Pending — **Phase 0 pe depend karta hai** |
| 4 | Quiz runner modal UI (frontend) | ⚪ Pending |
| 5 | Practice Quiz Hub (frontend) | ⚪ Pending |
| 6 | Polish + analytics (fullstack) | ⚪ Pending |

**Phase 1 se pehle 4 decisions confirm karne hain** — blueprint §16 items **12, 13, 14, 15**:
- (12) Phase 0 ka fix apne alag commit mein? → *recommend: haan*
- (13) `awaiting_quiz` summary API mein "in progress" count hoga? → *recommend: haan*
- (14) Quiz ka entry point sidebar mein kahan? → *recommend: rail icon button*
- (15) Adhoore seeded Mix Quiz ka behaviour? → *recommend: kam questions + `partialBank: true`*

---

## 📓 SESSION HISTORY

> Newest sabse upar. Har entry 3-5 line — isse zyada nahi.

### 2026-08-09 — Phase 1 built, verified, seeded (DONE)
- **User ne 5 checkpoints maange** is phase ke andar (blueprint mein already allowed hai — "checkpoints banao, phase mat todo"): (1) bulk file laana, (2) transform script + seed files, (3) 3 models, (4) seed engine, (5) real seed. Har checkpoint: build → verify → commit, ya problem discuss karke turant fix / Parking Lot.
- **Decision 16 confirm hua:** 6 kam-count chapters (16-40 questions) ship-as-is, no minimum enforce.
- **Real bug pakda gaya Step 1 mein:** blueprint §17 ka "744" verify-target khud ke §19 per-chapter table (743) se contradict karta tha — `science.meta.chapter-00` ka 1 question uss 744 mein included tha lekin per-chapter table mein nahi. User-confirmed: **743 hi sahi target**, meta chapter transform script mein skip hota hai.
- **User ne teeno models ka field naming reject kiya** — "robotic" laga. Poora rethink hua: `seedKey`→`questionCode`, `options[].key`→`options[].label`, `correctAnswer`/`shuffledCorrectKey`→ ek hi naam `correctOptionLabel` teeno models mein, `yearAsked`→`askedInYears`, `servedQuestions`→`questions`, `submittedAttemptId`→`attemptId`, `quizSessionId`→`sessionId`, `idempotencyKey`→`submissionKey`, `*Snapshot` suffixes chote kiye. `userId`/`guestId`/`subjectId`/`chapterId`/`topicId` **jaan-bujh kar nahi badle** — poore app mein already yahi naam use hote hain. `createdBy`/`updatedBy` add hue (Question mein `createdBy: 'seed-script'` default; Session/Attempt mein skip kiya, userId/guestId already creator batate hain).
- **Ek mid-phase bug pakda gaya after Step 3:** Step 2 ke seed files purane field names use kar rahe the (rename se pehle bane the). Transform script update karke 16 files regenerate hui — ab seed JSON aur DB models exact same field names use karte hain.
- **1 cheez deliberately skip hui:** blueprint §12 step 5 (Redis quiz-cache clear) — cache khud abhi exist nahi karta (Phase 2 mein banega). Parking Lot P-7.
- **Final verify:** `quiz:seed` → 743 inserted, 0 updated, 0 deactivated. DB query se confirm: 743 total, 743 active, 16 distinct chapters, biology ch01 = 103 (max), biology ch06 = 16 (min). Baseline test suite same as before (koi regression).
- **5 commits is phase mein:** `2d51287` (bulk file), `3ded7ca` (transform + seed files), `b4d8072` (3 models), `3a0e51b` (field-name fix on seed files), `db5b442` (seed engine + npm scripts).
- **Agla:** naya session, "Quiz Phase 2 shuru karo" bolna. Phase 2 shuru karne se pehle blueprint §16 decisions 12/13/14/15 confirm karni hain (Phase Board ke neeche list hai), aur naye field names (is file ke top ke mapping table se) yaad rakhne hain — blueprint text khud purane naam use karta hai.

### 2026-08-09 — Phase 1 replanned (no code written)
- **Kya hua:** User ne "Quiz pipeline continue karo" bola. Beat 1 (SAMJHO) shuru kiya — baseline test green (chat-db-models wahi red jo pehle se tha). Phase 1 explain karte waqt user confused hua "sirf 3 chapter, 50 hand-written questions kyun?" — investigate kiya toh pata chala: ek alag branch `quiz-phase0.5-bulk` pe already ek real 744-question bank ban chuka tha (2016-2026 ke Bihar Board papers se OCR + verify), saare 16 chapters cover karta hai, 3 languages (en/hi/hinglish) mein.
- **User ne implementation rokne ko bola** ("abhi kuch bhi mat karo... sirf explain karo") — do rounds mein deep-dive explanation di (widgets se): pehle "kya/kyun" high-level, phir models/seedKey/connections/3-language schema ka detailed audit jo user ne khud maanga.
- **Poora plan blueprint mein likha:** `QUIZ_SYSTEM_BLUEPRINT.md` ko v3 banaya — naya **§19** poori kahani ke saath, aur §3/§5/§11/§12/§16/§17 sab **[AUDIT 2026-08-09]** marks ke saath update kiye (3-language schema, real per-chapter counts, seed-format transform-script approach, future Question Management API concept, superseded decisions 5/6/10 → naye 16/17).
- **Koi code nahi likha is session mein** — user ne explicitly bola implementation agli session mein.
- **Ek open decision agli session ke Beat 1 mein confirm karni hai:** blueprint §16 decision 16 — 6 chapters 50-question target se kam hain (16 se 40 tak), recommend ship as-is.
- **Agla:** naya session, "Quiz Phase 1 shuru karo" bolna. Beat 1 seedha blueprint §19 se shuru hoga, phir decision 16 confirm karke Beat 2 (BANAO) mein transform script + models + seed script banega.

### 2026-08-02 — Phase 0 complete
- **Kya hua:** `step7.saveAndRespond.js` mein 2-line fix — `retrievedContext` ab sahi jagah se padha jata hai, `isComplete` check kaam karta hai.
- **Baseline detour:** golden test mein 2 stale fixture bugs mile aur fix kiye — C07 (cell membrane, syllabus mein hai hi nahi → O06 ban gaya) aur N01-N04 (missing `chapterId`, jo galti se "rate limit" jaisa dikh raha tha par asal mein 400 validation error tha). Dono `golden-queries.json` mein fix, poori reasoning `note` field mein.
- **Verify:** real DB test se confirm — chapter complete hone par status `'completed'` banta hai, `chapter_completed` event log hota hai, normal turn galti se complete nahi hota. Golden test 33P/7W/0F (baseline 34P/6W/0F, 0 FAIL dono baar) — koi regression nahi.
- **User feedback mila:** explanation style bahut complicated thi — ab short sentences, spacing, ek-ek karke. Permanent memory mein save kiya.
- **Agla:** commit karo, phir Phase 1 (`Quiz Phase 1 shuru karo` bolna).

### 2026-08-02 — Setup session (Phase 0 se pehle)
- **Kya hua:** Repo-wide stale file audit (4 orphan debug scripts delete, `PROBLEMS.md` archive, doc fixes) → commit `2d380cd` on `stalefilefixes`.
- **Phir:** `QUIZ_SYSTEM_BLUEPRINT.md` ka full audit live code ke against. **3 blocker, 3 internal contradiction, 5 factual mismatch** mile — sab file mein `[AUDIT]` blocks + naya §18 changelog ban ke inline fix ho gaye. Blueprint 1279 → 1780 lines.
- **Sabse bada finding:** chapter-completion hook (`step7:309`) dead code hai — isi wajah se naya **Phase 0** bana.
- **Setup:** `QUIZ_EXECUTION_PROTOCOL.md` + ye log file banayi, `CLAUDE.md` mein pointer add hua. User ne `stalefilefixes` ko `main` mein merge kiya aur teeno quiz files ko `quiz` branch pe commit kiya (`8673530`). `main` ka cleanup commit `quiz` mein merge kiya (`e3d65ee`, clean, no conflicts) — ab `quiz` `main` se fully sync hai.
- **Agla:** Phase 0 shuru — is file ke Phase 0 DoD section se.
