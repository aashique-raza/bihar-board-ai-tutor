# Quiz System — Build Log

> **Ye living state hai.** Har session ke end mein update hoti hai.
> Rules `QUIZ_EXECUTION_PROTOCOL.md` mein hain · Spec `QUIZ_SYSTEM_BLUEPRINT.md` mein hai
>
> **Ye file hamesha chhoti rahegi.** Purana session history neeche collapse hota jayega.

---

## ▶️ AGLI SESSION MEIN YE BOLNA

```
Quiz pipeline continue karo
```

Bas itna. Claude khud ye file padhega, "ABHI KAHAN HAIN" se current stage uthayega,
`QUIZ_DATA_PIPELINE.md` se us stage ka spec padhega, aur wahi se shuru karega.

---

## 📍 ABHI KAHAN HAIN

| | |
|---|---|
| **Current Phase** | **Phase 0.5 — Quiz Data Pipeline** → spec: **`QUIZ_DATA_PIPELINE.md`** |
| **Sub-stage** | **Stage P (Pilot)** — paper `2016-a` ko poora A→G chala rahe hain |
| **Status** | 🟡 Stage B (pages) ✅ · Stage C (blocks) ✅ · Stage D–G baaki |
| **Branch** | `quiz-phase0.5-bulk` |
| **Last session** | 2026-08-03 — pilot ka Stage C (question blocks) |

> ⛔ **`QUIZ_SYSTEM_BLUEPRINT.md` Phase 1 tab tak shuru nahi hoga** jab tak
> `QUIZ_DATA_PIPELINE.md` §12 ke exit criteria tick nahi hote. Data pehle, feature baad mein.

### 📌 Phase 0.5 — ye kyun bana (2026-08-03)

Quiz ka data 2016–2026 ke asli Bihar Board PYQ papers se banega — teen language mein
(Hindi / English / Hinglish), verified answers ke saath, aur repeat-detection ke saath
("ye question 3 baar aa chuka hai").

Pehle ye kaam chat ke through ho raha tha (PDF → Antigravity → copy-paste → verify).
Wo tareeka **fail** ho gaya: 3 baar galat saal/shift label aaya, 2 baar duplicate paper aaya,
aur answers galat aaye. Us session ka saara data **discard** kar diya gaya.

Naya tareeka: saare PDF repo ke andar (`data/quiz-bank/pdfs/`), script + vision se extraction,
stage-wise immutable output, aur har answer ka confidence level. Poora design
`QUIZ_DATA_PIPELINE.md` mein hai.

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

**FIXED (baseline setup ke dauraan, Parking Lot mein nahi gaye — turant fix kiye kyunki baseline ko accurately padhna hi Phase 0 shuru karne ki shart thi):**

- **`golden-queries.json` C07** — "Cell membrane ka kya kaam hai?" `CONCEPT_QUESTION` expect karta tha; `data/class-10/science/` mein "cell membrane" ka koi mention hi nahi (Class 9 NCERT topic hai, Class 10 Bihar Board syllabus mein nahi). Decider sahi tha (`OUT_OF_CONTEXT`), test fixture galat thi. `O06` bana ke `OUT_OF_CONTEXT` section mein move kiya, poori reasoning `note` field mein likhi.
- **`golden-queries.json` N01-N04** — `studyMode: "focus"` tha par `chapterId` missing thi. `step1.validateInput.js` Focus Mode ke liye `chapterId` required maanta hai; missing hone par `400 ApiError`, jise `askOrchestrator.js:68-69` `status: 'provider_error'` mein wrap kar deta hai — aur golden-script us status ke liye hamesha "rate limit / LLM unavailable" hardcoded print karta hai, chahe wajah kuch bhi ho. Isi wajah se ye rate-limit jaisa dikha, tha bilkul nahi. Fix: sab 4 mein `chapterId: "science.physics.chapter-01"` add kiya. 4/4 PASS confirm hua.

---

## 🗺️ PHASE BOARD

| Phase | Kya | Status |
|---|---|---|
| **0** | Prerequisite — chapter completion fire karana | ✅ **DONE** |
| 1 | Question models + seed data (backend) | 🟡 **Next** |
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

### 2026-08-03 — Pilot Stage C: question blocks
- **Bana:** `backend/scripts/quiz-bank/buildBlocks.js` + `npm run quiz:blocks` → output
  `data/quiz-bank/stage2-blocks/2016-a.json`. Backend `src/` ka koi file touch nahi hua.
- **Result:** `2016-a` se **52 block** — Group A 30 + Group B 20 + 2 OR-alternative.
  Marks: A 60/60, B 20/20 (declared se exact match). **Flagged block: 0.** Dobara chalane pe
  byte-identical file (P5 ✅).
- **Do trap handle hue:** (1) cover page ke instructions bhi `1.`–`5.` numbered hain — isliye
  kaatna "ग्रुप - A" header ke baad hi shuru hota hai aur number ekdum agla hona chahiye;
  (2) option (c) ke andar hi "(a) और (b) दोनों" likha hota hai — option markers aage badhte hue
  dhoondhe jate hain taaki wo option toote nahi.
- **Ek purani galti sudhri:** pilot findings mein likha tha "Q28, Q29, Q30 teeno ke paas OR hai".
  Asal mein sirf **Q28 aur Q29**. Marks total 60 exact match hone se confirm hua.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression nahi.
- **Agla:** Stage D pilot — 52 block ko schema mein daalna + Hinglish banana (pilot sawaal #5).

### 2026-08-03 — Phase 0.5 shuru: data pipeline design + pilot ka page-reading
- **Purana kaam discard:** chat-based extraction (Antigravity se JSON copy-paste) fail ho gaya —
  3 baar galat year/shift, 2 baar duplicate paper, aur galat answers. Us din ke 7 papers delete.
  Naya branch `quiz-phase0.5-bulk` banaya Phase 0 ke upar se.
- **21 PDFs repo mein aaye** (`data/quiz-bank/pdfs/`), survey script bana
  (`backend/scripts/quiz-bank/surveyPdfs.js`). **3 hard findings:** (F1) `2017 a` aur `2017 b`
  bilkul same file hain → asal mein **20 unique papers**; (F2) kisi bhi paper se Unicode Hindi
  nahi milti → saare papers page-image se padhne padenge; (F3) papers pe jo answer-nishaan hain
  wo **pen se lage hain aur ~45% galat hain** — purana "Ampere vs Ohm" bug isi wajah se tha.
- **`QUIZ_DATA_PIPELINE.md` bani** — 9 principles, poora schema, ID strategy, 7 stages (A–G),
  4 confidence levels, dedup rules, exit criteria. Audit mein 18 gaps mile aur fix hue.
  `CLAUDE.md` mein pointer add — ye file blueprint se **pehle** padhi jayegi.
- **Stage P (Pilot) add hua** — pehle ek paper poora A→G, phir baaki 19. Pilot paper `2016-a`
  ka page-reading ✅ done: 8 PDF page → 50 questions, Hindi+English dono saaf.
  Bada finding: 1 PDF page = 2 printed page, isliye kaam aadha (~190 page reads, 382 nahi).
- **Agla:** pilot ka Stage C+D — 50 questions ko structure + 3 language mein daalna.

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
