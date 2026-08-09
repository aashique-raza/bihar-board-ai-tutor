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
| **Sub-stage** | **✅ PHASE 0.5 COMPLETE.** All §12 exit criteria met (see session 6 below). `QUIZ_SYSTEM_BLUEPRINT.md` Phase 1 is now unblocked. |
| **Status** | 🟢 Pilot (Stage P). 🟢 Stage B. 🟢 Stage C. 🟢 Stage D. 🟢 Stage E. 🟢 Stage F. 🟢 Stage G — review queue 🔴 0, human-review pool (173 questions) fully cleared, L3+ **98.5%** (need ≥90%), golden set (30/30) built and hand-verified. **Next session starts Phase 1**, not Phase 0.5. |
| **Branch** | `quiz-phase0.5-bulk` |
| **Last session** | 2026-08-09 (session 6) — See full entry below. Finished the human-review pool (84 remaining questions, batches 10-17), fixed a real gap where session 5's 88 confirmed decisions had never actually been applied to the data, found and fixed 5 wrong "verified" answers while building the golden set, and closed out all §12 exit criteria. **Agla: start Phase 1** (`QUIZ_SYSTEM_BLUEPRINT.md`) — read its Phase 1 section fresh, confirm the 4 open decisions in §16 (items 12-15 below) with the user first. |

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
| P-7 | `npm run rag:test-retriever` khud fail hota hai — script kabhi `connectDB()` call hi nahi karta, isliye Mongo se connect hue bina seedha `Chunk.aggregate()` chala deta hai aur 10s buffering timeout pe fail hota hai. RAG khud theek hai (Stage E session mein seedha `retrieveRelevantChunks()` connect karke test kiya — kaam karta hai) — sirf ye ek test script broken hai. | `backend/scripts/test-retriever.js` | Stage E baseline check, 2026-08-04 | 🟡 Medium — RAG debug karne ka documented tareeka hi kaam nahi karta |
| P-8 | Stage B (page reading) ke notes mein handwritten-mark observations already hain (jaise "Handwritten mark seen on (ii) next to 'Convex' — WRONG") — par Stage D/E in notes ko question ke `flags[]` mein propagate nahi karte. Har MCQ pe `flags: []` khaali hai. Ek future Stage G review ke liye useful cross-check hoga agar ye pull-forward ho jaye. | `backend/scripts/quiz-bank/buildBlocks.js`, `buildQuestions.js` | Stage E session, 2026-08-04 | 🟢 Low — nice-to-have, kisi phase ka DoD nahi rokta |
| P-9 | `2016-a` ke pilot manifest mein `sourceMd5` field **galat hai** — usme `2016-c.pdf` ka hash likha hai, `2016-a.pdf` ka nahi. Content sahi hai (aaj `2016 a.pdf` dobara render karke pilot ke stored page-01 se match kiya, exact match) — sirf ek field ki typo/copy-paste galti hai, koi content mix-up nahi. Fix: field value ko `9b856dfc5d535dac2e44dc44ebaa0798` se replace karna hai. | `data/quiz-bank/stage1-pages/2016-a/_manifest.json` | Stage B batch 1 session, 2026-08-04 | 🟢 Low — cosmetic, content par koi asar nahi |
| P-10 | Answer key ke andar **"देखें <year> ... का उत्तर" (cross-reference) answers** — `2017-c` aur `2017-d` dono mein mila (3 alag questions total: 2017-c Physics Q9-Q10, 2017-d Physics Q7+Q10-main, Biology Q10-OR). Ye guide-book key kabhi-kabhi asli jawab likhne ke bajaye kisi **doosre paper/shift** ka reference de deta hai (jaise "2014(A) द्वितीय पाली Q7") jo hamare 21-PDF set mein confirm nahi hai. Stage E jab is tarah ka answer text dekhe to usse "unanswered" treat kare, RAG/textbook route le — parse karne ki koshish na kare. | `data/quiz-bank/stage1-pages/2017-c/`, `2017-d/` (page-05, page-08 wagaira) | Stage B batch 2 session, 2026-08-04 | 🟡 Medium — Stage E ka logic isse aware hona chahiye, warna galat parse ho sakta hai |
| P-11 | `2017-a` aur `2017-d` — **do alag PDF files (confirmed distinct MD5) ka poora question set (50/50) word-for-word identical hai**, Group A aur Group B dono. `2017-a` ke paas answer key nahi hai, `2017-d` ke paas hai — matlab Stage F dedup jab in dono ko link karega, `2017-d` ki key `2017-a` ke sawaalon ka bhi jawab de degi. Ye blocker nahi hai (Stage F apne aap handle karega dedup logic se), sirf ek note hai ki ye link zaroor bane. | `data/quiz-bank/stage1-pages/2017-a/`, `2017-d/` manifests | Stage B batch 2 session, 2026-08-04 | 🟢 Low — Stage F ke design ka hi hissa hai, sirf yaad rakhna hai |
| P-12 | `survey.json` (Stage A output) mein `2023-a` aur `2023-b` ke `pages` field **galat hain** — likha hai 1 aur 2, PyMuPDF se verify kiya to asal mein **42 aur 49 pages** hain. Content extraction sahi tha (`textChars`, `sample` field dono mein meaningful text hai) — sirf page-count parsing buggy nikla in do files ke liye. Stage B ko block nahi karta (apna independent PyMuPDF render use hota hai), par Stage A ka survey script kabhi fix hona chahiye taaki future reports sahi ginti dein. | `data/quiz-bank/reports/survey.json` (`2023-a`, `2023-b` entries) | Stage B batch 6 planning, 2026-08-04 | 🟡 Medium — abhi kisi ko galat direction nahi de raha (batch planning hand-verify se hua), par agar koi survey.json pe bharosa kare to batch-sizing galat ho sakti hai |
| P-13 | `2024-b` ka Stage C output **0 blocks** hai — Stage B ne is paper ka data `\|`-separated single mega-lines mein store kiya (koi `\n` nahi), isliye line-based segmentation (jo Stage C ka poora base hai) kaam nahi karta. Stage B page-reading is paper ke liye dobara karni hogi (sahi newline-separated format mein) — Stage C script khud theek hai, iska proof yehi hai ki baaki 17 papers pe sahi kaam karta hai. | `data/quiz-bank/stage1-pages/2024-b/` | Antigravity Stage C run, 2026-08-05 | 🟠 Medium — 1 paper ka poora data abhi quiz bank mein nahi hai |
| P-15 | Stage D mein 146 questions ko `flags: ["provenance-note-stripped"]` mila — inke text mein Stage B ke apne inline notes (jaise `[Q1 continued]`) the jo strip kar diye gaye, par kuch mein us note ke baad ka **duplicate content** (jaise dobara likhe options "A. Oont B. Ghoda...") abhi bhi text ke end mein reh gaya hai — sirf bracket-note hata, poora duplicate hissa nahi. Ye har jagah nahi, sirf un cases mein jahan Stage B ne asli recap/duplicate hi likha tha. Stage G review in 146 questions ko zaroor spot-check kare. | `data/quiz-bank/stage3-questions/*.json` (`flags` field) | Stage D bulk session, 2026-08-05 | 🟡 Medium — 146 questions, sab visible via flag, koi silent nahi |
| P-16 | Stage D ki Hinglish batch-translation (LLM se) mein ek confirm hua case mila jahan **2 options ka Hinglish output aapas mein badal gaya** (option C ko D ka translation mila, aur ulta) — `2022:A:13`. Turant pakda gaya kyunki us questions mein bracket-note bhi tha (isliye verify karte waqt dikh gaya); par ye ek **generic LLM batch-id risk** hai — agar kisi aur question mein aisa hua ho jahan koi bracket-note na ho (matlab kuch clue na ho), wo silently galat reh sakta hai. Is ek case ko fix kiya gaya (cache se hata ke dobara translate), poori bank mein aisa aur kahin dikha nahi (dedicated scan se), par ye scan sirf bracket-pattern dhoondta hai — pure swap (bina kisi text artifact ke) uss scan se nahi pakड़ेga. | `backend/scripts/quiz-bank/buildQuestions.js` (LLM batch translation) | Stage D bulk session, 2026-08-05 | 🟡 Medium — Stage G ke golden-set/10-sample-per-paper QC isko structurally catch karega, par abhi ek known blind-spot hai |
| P-17 | Objective-section MCQs mein `marks` field **zyada papers mein null hai** — sirf chhote/purane papers (`2016-a/b/c`, `2017-a/c/d`, sab ≤20 MCQ) mein marks bhara hai; baaki har full-size paper (`2018-a` se `2026` tak) mein 80-95% objective MCQs ka `marks: null` hai, jo `marks-missing` blocker laga deta hai aur `usableInQuiz` ko bahut neeche kar deta hai — jabki answer khud L3+ verified hai. Pattern itna consistent hai (chhote papers 0%, bade papers 80-95%) ki ye Stage C/D ka koi systemic gap lagta hai, per-paper fluke nahi. Stage E ka kaam nahi hai ise fix karna (sirf answers verify karta hai), par Stage F/G se pehle iski jaanch honi chahiye — warna quiz-eligible pool asli se bahut chhota dikhega. | `data/quiz-bank/stage3-questions/*.json`, `stage4-answers/*.json` (`marks` field, objective section) | Stage E bulk session, 2026-08-05 | 🟠 Medium — answers sahi hain, par bahut saare quiz-ready questions blocked dikh rahe hain jinka असli blocker sirf ek missing field hai |
| P-14 | `2018-a` mein Q4 ka number scan mein clip ho gaya tha (Stage B ne khud inline note likha: "question number clipped at top edge"). Stage C ka naya gap-tolerance fix (+3 tak) ne is wajah se hone wala bada cascade bug (dozens of questions ek hi option mein swallow ho jaana) रोक diya, par khud Q4 ka content ab bhi Q3 ke last option ke andar hi fused hai (uska apna sourceId kabhi nahi banega) — iske liye ya to us page ko manually dobara padhna hoga, ya Q4 ko permanently "lost" maan ke chhodna hoga. | `data/quiz-bank/stage2-blocks/2018-a.json` (`2018-a:A:3` ka option D) | Stage C fix session, 2026-08-05 | 🟢 Low — 1 question, already visible via paper flag `"A: number jumped from 3 to 5"` |
| P-18 | `2018-b` ek guide-book style paper hai jahan **har MCQ ke saath uska printed answer wahi line mein baked hai** ("...(D) all of these Ans: concave mirror"). 2026-08-08 ke © fix ke baad options ab sahi split hote hain, par **"Ans: ..." text ab bhi option D ke body ke end mein reh jaata hai** — kisi ne use kaata nahi, na hi answer field mein route kiya. Ye is paper ke saare 35 objective MCQs ko affect karta hai. Fix ke liye naya logic chahiye (trailing "Ans:"/"Uttar:" detect karo, option se kaato, jis option ka text usse match kare use `correctOption` bana do) — aur ye Stage C (`buildBlocks.js`, jiska output mein `answer` field hota hi nahi) ka scope nahi hai, Stage D/E mein jaana chahiye jahan `answer` field banta hai, existing "printed answer key" handling se coordinate karke. | `backend/scripts/quiz-bank/buildQuestions.js` ya `buildAnswers.js` (abhi decide nahi hua kaunsa), affects `2018-b` ke 35 objective MCQ | © fix session, 2026-08-08 | 🟠 Medium — 35 questions abhi answer-less hain is wajah se, par current phase iske bina bhi complete ho sakta hai |
| P-20 | **Systemic risk, not confirmed how widespread:** Golden-set hand-verification (session 6) checked 30 sample questions already marked L3/L4 ("verified") and found **5 wrong (17%)** — `2018-a:A:23` (periodic table groups, said 7 instead of 18), `2020-a:A:36` (ethane covalent bonds, said 2 instead of 7), `2020-b:A:1` (least reactive metal, said Mg instead of Fe), `2021:A:1` (negative-focal-length mirror, said Convex instead of Concave), `2026:A:1` (plane mirror focal length, said Zero instead of Infinity). All 5 fixed via `resolved.json` (now L4). **The concern:** Stage E's RAG-grounding check (`buildAnswers.js`) can apparently accept a wrong LLM answer as "textbook-verified" if the model's wrong claim still finds a superficial word-match in the retrieved excerpt. This was NOT re-checked against the full 671 L3+ pool — only this 30-question sample. If the same ~17% rate holds pipeline-wide, roughly 100+ "verified" answers could be silently wrong. Needs a dedicated future session: either a wider manual spot-check, or hardening the grounding check itself (e.g. require the claimed option's specific value to appear in the excerpt, not just any matching words). | `backend/scripts/quiz-bank/buildAnswers.js` (grounding check `normalizeForMatch`/verification logic) | Golden-set build, 2026-08-09 | 🟠 Medium — user explicitly deferred wider audit to a future session, decided not urgent enough to block Phase 0.5 close |
| P-21 | **More instances of the OCR-leak-into-option-text bug** (same shape as `2017-d:B:4`, first flagged 2026-08-08) found during session 6's human-review batches: `2024-a:A:4` (option D text has leaked continuation of the same question from the next page), `2025:A:35` (option D has "35. (C) 8 (D) 10.5" leaked from itself), `2025:A:39` (option D has a leaked "39. (C)...(D)..." fragment), `2026:A:17` (option D has a leaked page-8 continuation), `2026:A:45` (option D has "[Q45 English repeat from page...]" leaked text). In every case the correct answer was still determinable from the other 3 clean options plus general science fact — none blocked a `resolved.json` decision — but the underlying option D text in the bank remains cosmetically wrong (shows leaked/garbled text to a student, not the real option). Needs a Stage C/D fix to detect and strip this kind of trailing cross-question leakage, or a dedicated per-question text cleanup pass. | `data/quiz-bank/stage3-questions/*.json` (option D text on the 6 listed sourceIds, including original `2017-d:B:4`) | Human-review batches, 2026-08-09 | 🟡 Low-medium — cosmetic (answer key is right, displayed option text is not), affects 6 known questions |
| P-19 | `2018-b` ke 10 questions © fix ke baad bhi broken hain, **mixed alag-alag reasons se** — kuch confirmed: `A:2`/`A:27` mein option A ka opening bracket hi missing hai ("A)" likha hai "(A)" nahi, jo koi bhi parseOptions style match nahi karta); `A:10`/`A:21` ka reason abhi identify nahi hua. Group B ke 5 "broken" subjective items false-positive hain (unka "Ans:" hona hi normal hai, wo bug nahi). Ek-ek karke dekhna hoga. | `data/quiz-bank/stage2-blocks/2018-b.json` — `2018-b:A:2, A:10, A:21, A:27` + 6 aur (exact list us file mein `options===null` aur text mein "Ans"/"Uttar" dhoondh ke milega) | © fix session, 2026-08-08 | 🟢 Low — 10 questions, chhota impact, per-item bespoke fixes honge |

**FIXED (baseline setup ke dauraan, Parking Lot mein nahi gaye — turant fix kiye kyunki baseline ko accurately padhna hi Phase 0 shuru karne ki shart thi):**

- **`golden-queries.json` C07** — "Cell membrane ka kya kaam hai?" `CONCEPT_QUESTION` expect karta tha; `data/class-10/science/` mein "cell membrane" ka koi mention hi nahi (Class 9 NCERT topic hai, Class 10 Bihar Board syllabus mein nahi). Decider sahi tha (`OUT_OF_CONTEXT`), test fixture galat thi. `O06` bana ke `OUT_OF_CONTEXT` section mein move kiya, poori reasoning `note` field mein likhi.
- **`golden-queries.json` N01-N04** — `studyMode: "focus"` tha par `chapterId` missing thi. `step1.validateInput.js` Focus Mode ke liye `chapterId` required maanta hai; missing hone par `400 ApiError`, jise `askOrchestrator.js:68-69` `status: 'provider_error'` mein wrap kar deta hai — aur golden-script us status ke liye hamesha "rate limit / LLM unavailable" hardcoded print karta hai, chahe wajah kuch bhi ho. Isi wajah se ye rate-limit jaisa dikha, tha bilkul nahi. Fix: sab 4 mein `chapterId: "science.physics.chapter-01"` add kiya. 4/4 PASS confirm hua.

---

## 🗺️ PHASE BOARD

| Phase | Kya | Status |
|---|---|---|
| **0** | Prerequisite — chapter completion fire karana | ✅ **DONE** |
| **0.5** | Quiz Data Pipeline (question bank from 2016-2026 PYQs) | ✅ **DONE** (2026-08-09) |
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

### 2026-08-09 — Stage G finished: human-review pool cleared, golden set built, Phase 0.5 CLOSED
- **Found session 5's 88 confirmed decisions had never actually reached the data.** The backgrounded
  `quiz:answers` run from session 5 had produced `L4: 5` (only the original decisions from before
  session 5), not `L4: 93` as expected — the run must have completed before/without picking up the
  new `resolved.json` entries. Re-ran Stage E properly: L3+ jumped **77.1% → 88.9%** from that fix
  alone, before any new review work this session.
- **Finished the human-review pool** — 84 remaining L1/L0 objective questions (batches 10-17),
  same rhythm as session 5 (propose answer + reasoning, user confirms per batch, write to
  `resolved.json` immediately). Left `2026:A:30` genuinely unresolved (ambiguous "not an oxidation
  reaction" MCQ, same shape as the already-parked `2021:A:26`) rather than guessing. Re-ran
  Stage E→F→G: **L3+ 88.9% → 98.5%**, well past the ≥90% exit criterion.
- **Built the golden set** (`data/quiz-bank/golden/golden-questions.json`, §9/A5 — didn't exist
  before this session, no prior schema to follow so designed one: `{sourceId, questionId,
  chapterId, expected: {text, options, correctOption, confidence}, verifiedBy, verifiedAt, note}`).
  Selected 30 questions spread across all 17 papers that have usable objective content, mixed
  Physics/Chemistry/Biology, mixed L3/L4.
- **Caught 5 wrong "verified" answers while hand-checking the 30** (17% of the sample) — see
  Parking Lot P-20. Fixed all 5 via `resolved.json` (now L4). This is the golden set doing exactly
  its job: catching pipeline errors automated checks missed. **User explicitly decided not to
  widen the audit to the full 671-question pool this session** (deferred to a future dedicated
  session, logged as P-20) — golden set of 30 is enough to close Phase 0.5's own DoD.
- **Also flagged 5 more instances of the OCR-leak-into-option-text bug** (same pattern as the
  already-known `2017-d:B:4`) found while reading through the review batches — logged as P-21,
  none blocked an answer decision.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · re-checked twice more
  during the session (after the Stage E re-run, after the 5 golden-set fixes) · bilkul wahi har
  baar. Koi regression.
- **§12 exit criteria — all 11 checked and met:** 18 usable papers all `done`, 0 pending pages,
  trilingual 99.9% (≥95%), L3+ 98.5% (≥90%), 0 unresolved answer conflicts, chapter-mapped 99.9%
  (≥85%), review queue 0 🔴, `bank/questions.json` rebuilds in one command, numbers in
  `health.json`, and now golden set 30/30.
- **🎉 Phase 0.5 is DONE.** `QUIZ_SYSTEM_BLUEPRINT.md` Phase 1 is unblocked.
- **Agla:** start Phase 1. Read `QUIZ_SYSTEM_BLUEPRINT.md`'s Phase 1 section fresh (not from
  memory — it's been a while). Confirm the 4 open decisions in this file's §16 list (Phase 1
  entry point, `awaiting_quiz` status, sidebar UI, partial-bank behaviour) with the user before
  writing any code.

### 2026-08-08 — Stage G continued: extraction bugs fixed (2018-b, 2019-b), L3+ 75.1%→76.4%
- **Fixed both `buildBlocks.js` (Stage C) bugs from the 2026-08-06 investigation.** Bug A:
  OCR misread circled "(C)" as "©" on `2018-b`, breaking `parseOptions()`'s bracket style —
  fixed by normalizing "©"→"(C)" before matching. Bigger impact than estimated: **35 MCQs**
  got real options for the first time (were all `options: null`). Bug B: `2019-b`'s English
  side never prints a standalone "SECTION - A" header (only inside prose), so the Group-A
  search always missed and fell back to segmenting from page 1 — grabbing the cover page's
  own numbered instructions ("1. Candidates are required...") as question 1. Fixed: fall back
  to the "Question No. 1 to N..." line as the starting gun instead of line 0 when the real
  header is missing. `2019-b:A:1` now has the correct question, matching Hindi.
- **Scope stayed disciplined:** fixing the options-split surfaced a bigger same-paper pattern
  (all 35 MCQs still have the printed "Ans: ..." text trailing inside option D — needs new
  Stage D/E logic to strip and route to the answer field, not a Stage C fix) plus 10
  still-broken questions with mixed per-item causes. Both parked (P-18, P-19) instead of
  chased mid-session — confirmed with user first (STOP condition, Section 8).
- **Re-ran C→D→E→F→G on all 20 papers.** Confirmed via `git diff --stat` that only
  `2018-b.json`/`2019-b.json` actually changed content in Stage C — the other 16 papers'
  git-dirty flag was a CRLF line-ending artifact, not a P5 violation.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi.
- **L3+: 75.1%→76.4%** (567→577 usable / 1126 canonical). Still short of ≥90%.
- **Agla:** the retrieval-miss cause from 2026-08-06 (still open) — investigate the
  "insufficient" verdict bucket. Also decide P-18/P-19 in a dedicated Parking Lot session.

### 2026-08-06 — Stage G continued: red queue 47→0 (2 real code bugs found, not a data gap)
- **Investigated the 47 remaining red items before accepting the previous session's "genuine
  source gap" conclusion.** Checked 3 samples directly against Stage B's raw page text
  (`2018-a:A:16`, `2018-a:A:23`, `2020-a:A:22`) — all had fully-present options in the source.
  The conclusion was wrong; this was a Stage C bug, not missing content.
- **Bug 1 (`buildBlocks.js`):** `TRAILING_MARKS` (the same regex behind Parking Lot P17) runs
  per-line during buffer accumulation and strips any trailing 1-2 digit number as "marks" —
  including a numeric MCQ option's own answer value ("(A) 5" → "(A)", 5 silently discarded).
  First fix attempt gated on `groupLetter === 'A'` — broke the 2016-a pilot (197 lines diffed),
  because the pilot inverts Group A/B vs. every modern paper (file's own header comment already
  documents this). Reverted, fixed properly with a content-based `OPTION_LINE_START` guard
  instead (skip stripping only on lines that themselves start with an option marker) — re-ran,
  2016-a byte-identical, all 44 originally-broken questions confirmed fixed by direct inspection.
- **Bug 2 (`buildQuestions.js`):** language-backfill's `en-to-hi` direction rejected any
  translation with zero Devanagari characters — but the prompt's own rules 2 and 5 explicitly
  allow that for formulas, numbers, and scientific terms ("CaO", "21", "Stigma" are all legitimate
  Hindi-field values with no Devanagari). This silently left 7 more questions' short-value options
  un-backfilled even though the question-level flag claimed backfill succeeded. Fixed by dropping
  that half of the check (kept the `hi-to-en` direction's Devanagari-reject, which is still valid).
- **Re-ran C→D→E→F→G on all 18 papers after each fix** (baseline test suite checked before and
  after both — pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing), same after both fixes, no
  regression). Red queue: 47→10 (after Bug 1)→3 (after Bug 2). The final 3 were all the same
  already-documented genuine placeholder (`2023-a:A:43`, paper's own printed "question missing" —
  see F7 in `QUIZ_DATA_PIPELINE.md`), closed with one `resolved.json` decision
  (`field: "text.all"`). **Red queue now 0.** Usable-in-quiz 45.6%→49% (514→552/1126).
- **Lesson:** don't accept a "genuine source gap, nothing to do" conclusion from a prior session
  without re-checking a sample against the actual source — the data looked identical to a real
  gap until 3 pages were read directly (same lesson as the Stage C Antigravity session, logged
  below: verify against the source, not against the summary).
- **Agla:** L3+ is 73.1% (need ≥90%) — this is the only thing left blocking §12. Root cause not
  investigated yet (why so many objective answers aren't textbook-verifiable — likely
  out-of-syllabus content or RAG-retrieval gaps, unconfirmed). Once resolved, re-check full §12
  exit criteria (golden-set 30/30 also not re-checked this session).

### 2026-08-05 — Stage G continued: language-backfill built, red queue 355→47
- **Investigated the 355 🔴 red items** (all `language-missing`) before touching code. 271 unique
  questions affected; only 1 had zero text anywhere (`2023-a:A:43`, a known source placeholder).
  The other 270 had Hindi with no English or vice versa — and Bihar Board papers are always
  printed bilingual, so a one-sided gap is an **extraction gap**, not a missing-content gap.
- **User decision (delegated):** asked user how to handle `2018-b` (the retyped English-only
  paper with no Hindi source at all — 40 questions). User said "you decide". Decision: LLM-
  translate the missing side from whichever side exists, for every such gap paper-wide (not
  just `2018-b`) — flagged transparently (`language-backfilled-<lang>`), never presented as a
  verified source reading. Chosen because manually re-reading ~600 fragments across 15 papers
  doesn't scale, and 94.7% (fixing everything except 2018-b) would still miss the ≥95% exit
  criterion.
- **Built:** `ensureLanguageBackfill`/`applyLanguageBackfill` in `buildQuestions.js` (Stage D) —
  separate cache (`_language-backfill-cache.json`) from the Hinglish cache, separate prompt, same
  batch/retry/P5-cache shape as the existing Hinglish step. Runs before Hinglish generation so
  Hinglish always sees complete hi+en. Spot-checked output quality on `2016-b` before running the
  full bank — translations correct, flags visible.
- **Re-ran D→E→F→G on all 18 papers.** Stage E re-verified answers for questions that now have
  English for the first time. Result: red queue 355→**47**, objective language-complete
  86.8%→**99.9%**, usable-in-quiz 447→514 (39.3%→45.6%).
- **Remaining 47 red items are a different, smaller problem:** specific MCQ options where BOTH
  hi and en are empty (nothing for the backfill to translate from) — a genuine Stage B/C
  extraction gap on ~40 questions across several papers. Needs manual page re-read (Stage B
  territory) or a documented `resolved.json` acceptance — not attempted this session, flagged for
  next.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi.
- **Agla:** (1) 47 remaining red items — decide manual re-read vs accept-and-clear per item,
  (2) L3+ confidence is 72.2%, need ≥90% — separate investigation into why so many objective
  answers aren't textbook-verifiable (likely out-of-syllabus or RAG-retrieval gaps, not yet
  looked into), (3) once both move, re-check full §12 exit criteria.

### 2026-08-05 — Stage G started: review queue + health report, marks-missing blocker found and fixed
- **Chalaya:** `npm run quiz:review` (`buildReview.js`, already existed from Pilot) against the
  full 18-paper bank. First result: **only 41/1138 (3.6%) questions usable in quiz** — far below
  §12 exit criteria. Investigated instead of accepting the number.
- **Root cause traced (not assumed):** the dominant blocker was `marks-missing` — 682/1138
  questions (60%). Checked whether a cheap fix (backfill from the paper's declared section
  total) would work — it wouldn't, `declaredMarks.A` is null for exactly the papers that need
  it. Went further: sampled the 149 objective questions that *did* have a parsed `marks` value
  and found garbage — e.g. "Zinc ka atomic number kya hai?" had `marks: 30`. Root cause: Stage C's
  per-line trailing-number parser (`splitMarks`/`TRAILING_MARKS`) can't tell a marks annotation
  from a numeric MCQ answer option (e.g. "...is 30") sitting on the last line of a question's
  buffer — both look identical to the regex.
- **Fix (Stage C, `backend/scripts/quiz-bank/buildBlocks.js`):** in `buildBlocks()`, once a
  block is classified `isMcq`, marks is now set to `1` unconditionally (Bihar Board convention,
  confirmed on every paper's own section header during Stage B reading — objective MCQs are
  always 1 mark, no exceptions) instead of trusting the unreliable per-line parse. Every override
  is recorded as a visible flag (`marks-defaulted-mcq-hi-<old>-en-<old>`), never silent.
  Subjective marks logic (Group B long/short answer, where inline `[6]`/`[5]` marks ARE real)
  untouched.
- **Re-ran full pipeline C→D→E→F→G on all 18 papers** (Stage D reused its translation cache —
  no LLM cost; Stage E re-verified answers via RAG, ~free, cache-hit heavy). Result: **usable in
  quiz jumped from 41 to 447 (39.3%)**. Verified the fix directly on the sample case
  (`2020-b:A:3`): `marks` now `1` (was `null`, had been mis-parsed as `20` before that), flag
  visible, `blockers: []`.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi.
- **Session paused here (not phase-complete):** `review/queue.json` still has 448 open items
  (355 🔴 language-missing, 92 🟠 near-duplicate, 1 🟡 chapter-unmapped) — none cleared yet.
  §12 exit criteria still not met: L3+ is 66.2% (need ≥90%), trilingual-complete is 86.8% (need
  ≥95%). **Agla:** clear the review queue (start with the 355 red language-missing items),
  re-run `quiz:review`, check numbers again against §12.

### 2026-08-05 — Stage F: all 18 papers (dedup + chapter mapping)
- **Chalaya:** `backend/scripts/quiz-bank/buildBank.js` (already existed from Pilot, generic —
  reads every paper in `stage4-answers/`) via `npm run quiz:bank`. **1152 total questions →
  1138 canonical entries**, 92 near-duplicate clusters proposed (never auto-merged, human
  review in Stage G), 99.9% chapter-mapped (1 unmapped, see below).
- **Blocker found + fixed (Beat 3 CHECK, not trusting first-run numbers):** first run gave
  1002 canonical entries with 150 "exact merges" — suspiciously high. Traced it: `questionFingerprint()`
  only read `question.text.en`. Many subjective/short-answer questions never got an English
  translation from Stage D (`text.en: null`), so `normalizeText(null)` → `""` for all of them —
  every English-missing question got the *same* fingerprint and falsely merged. Two mega-groups
  (`q-000053` repeatCount=82, `q-000054` repeatCount=56) turned out to be **138+ completely
  unrelated questions** (e.g. "light reflection rules" merged with "aluminium alloy name")
  silently collapsed into 2 fake entries, discarding all but one "best" version each time.
  **Fix:** fingerprint falls back to `text.hi` when `text.en` is empty (Hindi is always
  present). Re-ran: 1138 canonical entries, exact-merges dropped to 14 (real repeats across
  years, max repeatCount 2 — realistic).
- **The 1 remaining unmapped question checked and confirmed legitimate**, not a new bug:
  `q-000053` (post-fix) = `2023-a:A:43`, the paper's own printed "question missing"
  placeholder from Stage B (source PDF genuinely incomplete there) — correctly empty, correctly
  flagged, correctly unmapped.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi.
- **Agla:** Stage G — review queue + final health report, `QUIZ_DATA_PIPELINE.md` §12 exit
  criteria ke against, naya session mein.

### 2026-08-05 — Stage E: all 18 papers (answers + verification)
- **Bana:** `backend/scripts/quiz-bank/buildAnswers.js` (already existed from Pilot) sab 18
  papers pe chalaya → `data/quiz-bank/stage4-answers/<paperId>.json`. **761 objective MCQs
  processed, 503 L3+ (textbook-verified via RAG, quiz-eligible answer).** `2024-b` = 0
  (expected, P-13 — Stage C input hi khaali hai).
- **Real bug pakda (blocker, isi session mein fix hua):** pehla run **7 papers** (`2016-b`,
  `2016-c`, `2017-c`, `2017-d`, `2019-b`, `2023-a`, `2024-a`) pe crash ho gaya —
  `retrieveRelevantChunks()` empty string pe `throw` karta hai, aur `resolveAnswer()` seedha
  `question.text.en` bhej deta tha bina check kiye. Kuch questions mein English text kabhi
  tha hi nahi (Stage C se hi `missing-english` flag/blocker laga hua tha — Hindi-only source
  ya genuine content gap), isliye crash hota, aur **poore paper ka kaam khaali reh jaata**
  (koi partial output nahi bachta). `npm run` ke pipe (`| tee`) ne exit code bhi mask kar diya
  tha — bash ne `0` dikhaya jabki node script khud `1` pe exit hua tha (`tee` ka exit code hi
  liya gaya). **Sirf output files count karke hi pakda gaya** ("18 mein se sirf 11 files
  bani"), console "completed" trust nahi kiya. Fix: `buildAnswers.js` mein English-missing
  questions ko retrieval/LLM se pehle hi skip kiya jaata hai (waise bhi `missing-english`
  blocker ki wajah se quiz-usable nahi hote), `stats.skippedNoEnglish` naya field print hota
  hai. Baaki 7 papers dobara chalaye, sab 0 failures se pass hue.
- **Naya finding (Parking Lot P-17, Stage E ka scope nahi):** bade papers mein 80-95%
  objective MCQs ka `marks: null` hai (chhote 2016-17 papers mein 0%) — answer khud verified
  hai (L3+) par `marks-missing` blocker ki wajah se `usableInQuiz: false` reh jaata hai. Ye
  Stage C/D ka systemic gap lagta hai, Stage E ka nahi — likha gaya, fix nahi kiya.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi.
- **Agla:** Stage F — dedup + chapter mapping, sab 18 papers pe, naya session mein.

### 2026-08-05 — Stage D: all 18 papers (structure + 3 languages)
- **Bana:** `backend/scripts/quiz-bank/buildQuestions.js` (already existed from Pilot) sab 18
  papers pe chalaya → `data/quiz-bank/stage3-questions/<paperId>.json`. **1152 questions total
  (761 objective), 872 trilingual-complete.** `2024-b` = 0 questions (expected, P-13 — Stage C
  input hi khaali hai).
- **Lesson Antigravity session se seedha lagaya:** script chalane ke baad sirf counts/pass nahi
  maane — kuch actual questions ka text padha. Isi se 2 real bug pakde:
- **Bug 1 (bada):** Stage B ke apne inline notes (jaise `[Q1 continued]`, `[options continue on
  next page]`) jo sirf Stage B ke apne liye breadcrumb the, seedha question text ke andar reh
  gaye the — **135 jagah**, kai papers mein (`2021`, `2022`, `2025`, `2026` sabse zyada). Isi
  contaminated text se Hinglish bhi ban rahi thi. Fix: `buildQuestions.js` mein
  `stripProvenanceNotes()` add kiya (design ke mutabik cleanup Stage D ka hi kaam hai, Stage C
  jaan-boojh kar text nahi chhedta) — bracket-notes hata di jaati hain, aur jis question mein
  strip hua wahan `flags: ["provenance-note-stripped"]` lagta hai (chupchap fix nahi, visible
  rehta hai). Re-run kiya, 0 residual confirm hua (script se scan karke).
- **Bug 2 (chhota, alag tarah ka):** usi re-run mein ek question (`2022:A:13`) ke 2 options ka
  Hinglish translation LLM ne **aapas mein badal diya** (option C ko D ka jawab mila). Cache se
  wo 2 galat entries hata ke dobara translate karaya, fix confirm hua. Parking Lot P-16 mein
  likha — ye ek generic risk hai (kisi aur jagah bina kisi clue ke bhi ho sakta hai), Stage G
  review isko dhyan se dekhe.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi.
- **Agla:** Stage E — answers + verification, sab 18 papers pe, naya session mein.

### 2026-08-05 — Stage C: all 18 papers (user's Antigravity experiment → Claude finished it)
- **User experiment:** user ke paas Antigravity (Sonnet/Opus) bhi hai, wo test karna chahta tha
  ki kya Stage C jaisa mechanical script-run stage Antigravity ko diya ja sakta hai. Do handoff
  prompt files banaye (`tasks/handoff-stage-c-antigravity.md`, `tasks/handoff-stage-c-fix-antigravity.md`).
- **Round 1 (Antigravity):** `npm run quiz:blocks` sab 18 papers pe chalaya, report diya "sab
  paper-format diversity hai, expected hai". **Claude ne verify kiya to galat nikla** — asal
  mein `buildBlocks.js` ka header-regex sirf pilot paper ki wording ("ग्रुप"/"GROUP") pehchanta
  tha; 17/18 papers "खण्ड"/"भाग"/"SECTION" jaisi alag wording use karte hain, isliye har paper
  (pilot chhodke) cover-page se hi galat segment ho raha tha.
- **Round 2 (Antigravity):** header-regex fix kiya (`(?!\w)` lookahead Devanagari `\b` bug ke
  liye bhi), verify kiya `2016-a` regression-safe hai. **Claude ne phir verify kiya to ek aur,
  bahut bada issue mila** jo Antigravity ne count/flag hi dekha, block ka actual text kabhi
  padha nahi: Group B (subjective section, paper ke 20-30 marks) har modern paper mein garbage
  ya 0 blocks de raha tha, kyunki script ka poora Group-B-parsing logic sirf pilot ke MCQ
  stem+roman-subpart shape ke liye tha — modern papers ka Group B ek bilkul alag shape hai
  (ascending short/long-answer, subject-header breaks ke saath).
- **User ne bola "ab tum khud handle karo".** Claude ne khud fix kiya — 5 real bugs, sab raw
  Stage B text se verify karke (guess nahi): (1) header regex 3 variants (2) Group B shape
  structurally detect karna (stem vs ascending, ek adjacent-ascending-pair test se) (3) MCQ
  option letters 3 style (lowercase, uppercase, bare-dot, Devanagari अ/ब/स/द) (4) `[Page N]`
  breadcrumb jo trailing marks ko chhupa raha tha (5) guide-book papers ka printed answer key
  ("उत्तरमाला") Group B ke ascending-count ko confuse kar raha tha (6) ek missing/clipped
  question-number (`2018-a` Q4) poore paper ke baaki hisse ko ek hi option mein swallow kar raha
  tha — ±3 gap-tolerance add kiya, gap ab paper-flag mein visible hai, silent nahi.
- **Result:** sab 18 papers ke `stage2-blocks/<paperId>.json` bane. **761 MCQ blocks total,
  94.7% clean option-parse.** `2016-a` pilot byte-identical (sirf 2 naye transparency flags
  add hue, block content zero-diff) — regression-safe confirm hua.
- **Residual gaps (Parking Lot P-13, P-14):** `2024-b` = 0 blocks (Stage B data-format issue,
  alag paper, Stage B rerun chahiye), `2023-a` Group B mostly missing (genuine incomplete
  source, pehle se F7 mein documented), `2018-a` Q4 lost (source scan clipping, ab visible via
  paper flag, permanently unrecoverable bina us page ko dobara padhe).
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression.
- **Lesson liya:** Antigravity mechanical-looking stages bhi verify kiye bina trust nahi kiye
  ja sakte — dono round mein usne count/flag dekha, kabhi actual block **text** nahi padha, isi
  wajah se dono baar galat "sab theek hai" report diya.
- **Agla:** Stage D — structure + 3 languages (Hindi/English/Hinglish), sab 18 papers pe.

### 2026-08-05 — Stage B: `2026` finished — Stage B bulk COMPLETE (fresh session per F6 fix)
- **Bana:** `data/quiz-bank/stage1-pages/2026/page-01.json` se `page-30.json` (30/30 pages) +
  `_manifest.json` (`sourceMd5` computed fresh). Backend `src/` ka koi file touch nahi hua.
  Fresh session mein shuru hua, poora paper ek hi conversation mein khatam ho gaya.
- **Bada finding (naya STOP, F4/F8 jaisa):** page 1 confirm karta hai ye `2026.pdf` Bihar
  Board ka apna **official "MODEL QUESTION PAPER"** hai 2026 exam ke liye — real attempted
  paper nahi. User ko poochha, user ne **include as-is confirm kiya** (F4's fake-CBSE-guide
  jaisa nahi — genuine board content hai, bas kabhi attempt nahi hua). Koi pen-marks poore
  paper mein nahi mile — expected, kyunki model paper kabhi kisi student ne bhara hi nahi.
- **Paper structure confirmed:** 80+30=110 (cover ka "100+30+8=138" total instructions se
  match nahi karta, ignore kiya — jaisa 2024-b mein bhi hua). Section-A subject blocks clean/
  contiguous (Physics Q1-27, Chemistry Q28-51, Biology Q52-80) — 2024-b ka interleaving is
  paper mein nahi dikha. Section-B: Physics short Q1-8+long Q9-10(6 marks), Chemistry short
  Q11-18+long Q19-20(5 marks), Biology short Q21-28+long Q29-30(5 marks) — same recurring
  asymmetric pattern.
- **30 PDF pages = 30 declared printed pages, exact match** — is baar koi front-cover offset
  ya trailing-page gap nahi (2024-a/2024-b/2025 unlike). Section-A 80/80 aur Section-B saare
  30 subjective questions poori tarah present, paper Q30 tak saaf khatam hota hai.
- **2 print typo mile** (Q46 English option D duplicate "3" instead of "4"; Q32 English
  option B "2Kcl" instead of "2KCl") aur **2 jagah per-question marks missing** (Q9/Q10
  Physics long-answer marked [2] instead of [6]; Biology Q26-28 no mark shown) — sab section
  header ko source-of-truth maan ke resolve kiya, jaisa pichle papers mein bhi hua.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi (no `src/` file touched — data-only session).
- **🎉 Stage B bulk poora ho gaya — sab 18 usable papers ab page-read hain.** Agla: Stage C
  (question blocks) sab 18 papers pe, naya session mein.

### 2026-08-05 — Stage B: `2024-b` finished (fresh session per F6 fix)
- **Bana:** `data/quiz-bank/stage1-pages/2024-b/page-01.json` se `page-39.json` (39/39 pages) +
  `_manifest.json` (`sourceMd5` computed fresh). Backend `src/` ka koi file touch nahi hua.
  Fresh session mein shuru hua, poora paper ek hi conversation mein khatam ho gaya.
- **F8 lesson applied:** sabse pehle page 1 pe subject confirm kiya (SCIENCE, Subject Code 112,
  Set Code I) — koi mismatch nahi, alag paper/shift hai `2024-a` (Subject Code 212) se.
- **Paper structure confirmed:** 80+30=110 declared (cover confirms), Section-B 24 short-answer
  (8+8+8, answer 4 of each, 2 marks) + 6 long-answer (2 Physics @6 marks, 2 Chemistry @5 marks,
  2 Biology @5 marks, answer 1 of each) = 30 — same asymmetric long-answer marks pattern as
  2024-a/2025 (Physics=6, Chemistry/Biology=5). Section-A ends exactly at Q80 (80/80 confirmed),
  Section-B has all 30 subjective (Physics Q1-10, Chemistry Q11-20, Biology Q21-30).
- **Naya observation: subject blocks interleaved, not strictly grouped** — Q1-8 Chemistry, Q9-10
  Physics, Q11-22 Chemistry again, Q23 Physics, Q24 Biology, etc. Every paper so far (2021, 2022,
  2024-a, 2025) had one clean contiguous block per subject; this is the first exception. Noted
  per-page in the transcription, no impact on extraction quality since each question was still
  read individually.
- **40 printed pages declared, PDF has 39 — likely just a trailing blank/errata page 40, NOT a
  content gap** (unlike 2024-a's front-instruction-page explanation or 2023-a's genuine F7
  incompleteness). Page 1 here is correctly footer-labelled "Page 1 of 40" (a true cover, unlike
  2024-a's "Page 4 of 40" cover), and Q30 (the paper's last question) ends cleanly with no
  truncation — objective 80/80 and all 30 subjective present.
- **Print/scan artifact:** a "https://www.bsebstudy.com" watermark appears inline in Q51's
  English text (page 22) — a source-document artifact, not exam content, excluded from the
  actual question text and noted in that page's file.
- **Pen-marks again inconsistent with printed-correct answers** in places (e.g. Q66 pen mark on
  wrong option) while matching in others — F3 rule (marks never answer-source) reconfirmed.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi (no `src/` file touched — data-only session).
- **Agla:** naye/fresh session mein last paper `2026` (30 pages) — Stage B bulk ka aakhri paper.

### 2026-08-05 — Stage B: `2024-a` finished (fresh session per F6 fix)
- **Bana:** `data/quiz-bank/stage1-pages/2024-a/page-01.json` se `page-37.json` (37/37 pages) +
  `_manifest.json` (`sourceMd5` computed fresh). Backend `src/` ka koi file touch nahi hua.
  Fresh session mein shuru hua, poora paper ek hi conversation mein khatam ho gaya.
- **Paper structure confirmed:** 80+30=110 declared (cover confirms), Subject Code 212, Science
  correctly confirmed on page 1 (F8 lesson applied — subject check pehle hi kiya). Section-A
  Physics-first order (Q1 concave mirror magnification). Section-B: Physics short Q1-8(4 of 8)
  +long Q9-10(1 of 2, **6 marks**), Chemistry short Q11-18(4 of 8)+long Q19-20(1 of 2, **5 marks**),
  Biology short Q21-28(4 of 8)+long Q29-30(1 of 2, **5 marks**) — subjects NOT symmetric on
  long-answer marks (Physics=6, Chemistry/Biology=5), naya observation is paper mein.
- **40 printed pages declared par PDF mein sirf 37 — is baar F7 (2023-a) jaisa genuine
  incompleteness NAHI hai.** Cover page khud footer mein "Page 4 of 40" print karta hai —
  matlab is PDF mein printed pages 1-3 (generic candidate instructions, sab subjects ke beech
  common, subject-specific nahi) kabhi scan/include nahi hue. Paper Q30 tak ek printed
  end-of-paper double-line marker ke saath cleanly khatam hota hai; Section-A 80/80 aur
  Section-B saare 30 subjective questions poori tarah present hain — content-wise 100% complete.
- **Pen-marks kaafi jagah the, kai jagah galat ya ek dusre se conflicting** (jaise Q48 mein do
  options par alag-alag marks, Q77 mein bhi) — F3 rule (marks kabhi answer source nahi) ko
  concretely reconfirm karta hai.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi (no `src/` file touched — data-only session).
- **Agla:** naye/fresh session mein next paper from `2024-b, 2026` (2 papers left in Stage B bulk).

### 2026-08-05 — Stage B batch 8: `2023-b` excluded (F8), session stopped on user request
- **Bana:** kuch nahi repo mein. Sirf page 1-2 scratchpad mein render + vision-read hue (blocker
  turant mila), koi `stage1-pages/2023-b/` file kabhi banayi hi nahi gayi.
- **Bada finding (F8, `QUIZ_DATA_PIPELINE.md` mein likha gaya):** `2023 b.pdf` **Social Science**
  ka paper nikla (Subject Code 111), Science ka nahi — page 1 title aur page 2 ke objective
  questions (history/civics) dono confirm karte hain. F4 (`2019-a`, fake paper) se alag — ye
  genuine Bihar Board 2023 paper hai, bas galat subject. User ne turant exclude confirm kiya
  (`2019-a` jaisa treat), aur session yahin rokne ko bola.
  **Usable unique paper count 19 se 18 ho gaya.**
- **Baseline:** nahi chalaya — koi `src/` file touch nahi hui, blocker itni jaldi mila ki koi
  data-file bhi nahi bani.
- **Agla:** naye/fresh session mein `2024-a` se shuru (3 papers baaki: `2024-a, 2024-b, 2026`).
  Naya lesson: agle paper mein sabse pehle page 1 pe subject confirm karna (F8 se).

### 2026-08-05 — Stage B: `2023-a` finished (fresh session per F6 fix)
- **Bana:** `data/quiz-bank/stage1-pages/2023-a/page-01.json` se `page-42.json` (42/42 pages) +
  `_manifest.json` (`sourceMd5` computed fresh). Backend `src/` ka koi file touch nahi hua.
  Fresh session mein shuru hua, poora paper ek hi conversation mein khatam ho gaya.
- **Paper structure:** 80+30=110 declared (cover confirms), Section-A Physics-first order,
  40-of-80 answer-any format same as other recent papers.
- **Bada finding F7 (`QUIZ_DATA_PIPELINE.md` mein likha gaya):** PDF genuinely incomplete —
  cover declares "Total Printed Pages: 48" par PDF mein sirf 42 hain. Page 23 pe Q43 ki jagah
  source ke andar hi ek yellow-highlighted "43. question missing" placeholder mila (compiler ne
  khud flag kiya gap). Section-B Physics short-answer Q1-3 (of 8) tak jaake achanak khatam ho
  jaata hai — Physics Q4-8+long, aur poora Chemistry+Biology subjective missing. Objective
  section (Q1-80) 100% usable hai; subjective section incomplete hai.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi (no `src/` file touched — data-only session).
- **Agla:** naye/fresh session mein next paper from `2023-b, 2024-a, 2024-b, 2026`
  (4 papers left in Stage B bulk).

### 2026-08-05 — Stage B: `2025` finished (fresh session per F6 fix)
- **Bana:** `data/quiz-bank/stage1-pages/2025/page-01.json` se `page-34.json` (34/34 pages) +
  `_manifest.json` (sourceMd5 computed fresh). Backend `src/` ka koi file touch nahi hua.
  Fresh session mein shuru hua, poora paper ek hi chhoti conversation mein khatam ho gaya.
- **Paper structure confirmed:** 80+24+6=110 declared (cover page confirms), Section-A
  Physics-first order (Q1 shadow/light) unlike 2022's Biology-first. Section-B: Physics short
  Q1-8(4 of 8)+long Q9-10(1 of 2, 6 marks), Chemistry short Q11-18(4 of 8)+long Q19-20(1 of 2,
  5 marks), Biology short Q21-28(4 of 8)+long Q29-30(1 of 2, 5 marks).
- **PDF has 3 non-exam wrapper pages** beyond the 31 real printed pages: page-01 is an
  aglasem.com download-site cover (mislabeled "YEAR 2024" — checked against the real exam
  paper's own cover on page-02, which clearly confirms 2025; a download-site typo, not a
  content mismatch, not a blocker), and pages 33-34 are trailing aglasem.com promotional
  pages (asking readers to email them papers, and a study-materials link menu) — read as
  inert page data, not acted upon.
- **Several print typos found in the paper itself** (not our transcription): Q38 Hindi block's
  third option mislabeled "(B)" instead of "(C)"; Q44 English (B) printed "C6H12C6" instead of
  correct "C6H12O6"; Q50 English (A) "None-metals" instead of "Non-metals"; Q68 English (C)
  "Lap" instead of "Gum"; Q73 English (B) "Funds" instead of "Fundus". All transcribed exactly
  as printed with the correct version noted for Stage C+ to use the Hindi block as source of
  truth. Also both long-answer section instruction blocks (Q9-10, Q19-20, Q29-30 headers) have
  a recurring copy-paste typo: English says "Short Answer Type"/"Answer any 4" when Hindi
  correctly says long-answer/answer-any-1 — noted per section, not a data quality issue since
  Hindi + marks formula (6×1=6, 5×1=5) are unambiguous.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi (no `src/` file touched — data-only session).
- **Agla:** naye/fresh session mein next paper from `2023-a, 2023-b, 2024-a, 2024-b, 2026`
  (5 papers left in Stage B bulk).

### 2026-08-05 — Stage B: `2022` finished (fresh session per F6 fix)
- **Bana:** `data/quiz-bank/stage1-pages/2022/page-28.json` se `page-33.json` (baaki 6 pages) +
  `_manifest.json` (33/33 pages, `sourceMd5` computed fresh). Backend `src/` ka koi file touch
  nahi hua. **Fresh session mein shuru hua** (F6 fix ke mutabik) — poore 6 pages ek hi, chhoti
  conversation mein khatam ho gaye, koi usage-limit issue nahi aaya. F6 ka fix confirm ho gaya.
- **Poora paper structure confirm hua:** Section A objective Q1-80 (Biology-first order — Q1
  reproductive organs in plants — 2021 se ulta, jo Physics-first tha). Section B: Physics
  short-answer Q1-8 + long-answer Q9-10, Chemistry short-answer Q11-18 + long-answer Q19-20,
  Biology short-answer Q21-28 + long-answer Q29-30 (kul 24 short + 6 long = 30 subjective).
- **2 chhoti observation (blocker nahi, Stage C+ ke liye note):** Q13 ki dono reactions
  ((i)/(ii)) source page pe **word-for-word dobara print** hui hain (iii)/(iv) ke roop mein —
  jaisi dikhi transcribe ki. Q29/Q30 (aakhri 2 sawaal) pe per-question mark number print nahi
  hai (baaki sab long-answer questions pe hai) — section header se 5 marks confirm hota hai.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6, pre-existing) · baad mein bilkul wahi.
  Koi regression nahi.
- **Agla:** naye/fresh session mein `2025` (34 pages) — Stage B ka agla paper.

### 2026-08-05 — Stage B batch 6 attempt: `2022` partial (27/33), session force-closed (F6)
- **Bana:** `data/quiz-bank/stage1-pages/2022/page-01.json` se `page-27.json` (33 mein se 27) —
  koi `_manifest.json` nahi bani abhi. `2025` shuru hi nahi hua. **Kuch commit nahi hua** — files
  disk pe hain par git mein untracked (safe hain, khoyi nahi).
- **Bada operational finding (F6, `QUIZ_DATA_PIPELINE.md` mein likha gaya):** ye session batch 5
  ke turant baad, **usi lambi conversation mein** continue hua tha (naya session start nahi hua).
  Batch 5 khatam hote-hote 70% token quota use ho chuka tha; batch 6 ke 27 pages mein hi baaki
  30% bhi khatam, usage-limit error aaya. 5hr reset ke baad dobara try kiya — aur bhi tez khatam
  hua. Root cause: har page ek vision image leta hai, aur lambi conversation mein **har naya
  reply poori purani history (saare pehle ke images) dobara process karta hai** — cost snowball
  ki tarah badhta hai. Data-quality issue nahi hai, session-sizing ka tha.
- **Fix:** batching rule badla — ab **har naya paper fresh session mein shuru hoga**, purani
  conversation ke upar continue nahi karenge (chhote papers, jaise 2016-b+2016-c jaisे 8+8 page
  wale, abhi bhi ek saath ho sakte hain).
- **Baseline:** is session mein baseline test nahi chalaya gaya (koi code-affecting kaam nahi
  hua, sirf naya data + isi doc-update) — agla session shuru hote hi chalega.
- **Agla:** naye/fresh session mein `2022` page 28 se resume, 33/33 poora karke manifest banao,
  phir alag fresh session mein `2025` (34 pages).

### 2026-08-04 — Stage B bulk batch 5: `2020-b`, `2021` (bada paper, 2022 deferred)
- **Bana:** `data/quiz-bank/stage1-pages/2020-b/`, `2021/` — manifest + 55 page files total
  (20+35 PDF pages), PyMuPDF se 200 DPI PNG render karke vision se padha; `2021` ka text-layer
  bhi extract karke cross-check kiya (route "both"). Backend `src/` ka koi file touch nahi hua.
- **Batch size flag hua (STOP condition #4):** planned batch (`2020-b`+`2021`+`2022` = 88 PDF
  pages) pichle sabse bade batch (56 pages) se 57% zyada nikla. User ko batao, user ne `2022`
  ko agli session mein bhejne ka decide kiya — is session mein sirf 55 pages (`2020-b` + `2021`).
- **`2020-b`:** 48+28=76 structure (jaisa 2016-2018 ke papers), koi printed answer key nahi
  (2016-a/2020-a jaisa). Pen-marks bahut jagah **conflicting/galat** mile — Q10 aur Q23 dono mein
  ek hi sawaal pe do alag options pe checkmark, F3 rule ko aur confirm karta hai.
- **`2021` — sabse bada paper ab tak:** 80+24+6=110 declared (Section-A akela 80 MCQ hai, 48 nahi).
  Native-text PDF (F5 jaisa "clean printed", scan nahi) — koi handwritten mark nahi, koi answer
  bhi nahi (khaali question paper hai, kisi ne attempt nahi kiya). Text layer legacy-font mein hai
  (F2 confirm), sirf English cross-check ke liye usable. **Koi printed answer key nahi.**
- **2 sawaal general-knowledge flavor ke note kiye** (Q39 Tehri dam location, Q64 Ganga Action
  Plan year) — Class-10 Science textbook content nahi, Stage E/F ko flag karna hoga (out-of-syllabus
  ho sakta hai chapter-mapping ke liye).
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression
  nahi.
- **Agla:** Stage B batch 6 — `2022` (33 pages) se shuru, phir `2023-a, 2023-b, ...` (7 papers baaki).

### 2026-08-04 — Stage B bulk batch 4: `2018-b` (F5), `2019-b`, `2020-a`
- **Bana:** `data/quiz-bank/stage1-pages/2018-b/`, `2019-b/`, `2020-a/` — manifest + 56 page
  files total (20+16+20 PDF pages). Backend `src/` ka koi file touch nahi hua.
- **Naya finding F5 (`QUIZ_DATA_PIPELINE.md` §3.1 mein likha gaya):** `2018-b` asli scan nahi
  nikla — ek Word mein retype kiya hua document tha (poora English-only, har sawaal ke baad
  inline "Ans:", Word autocorrect artifacts, ek sawaal ka option/answer hi gayab). User se
  poochha, decision: **exclude nahi karna** — sawaal rakhna hai (genuine Class-10 content lagta
  hai) par iske "Ans:" ko kabhi answer-source nahi maanna (F3 wala hi rule, naya trigger).
  Content 20/20 page-reading se aa gaya, isके liye actual native text-layer use kiya (F2 ka
  "muft L3-jaisa bharosa" wala case) — vision se cross-check karke confirm kiya match hai.
- **`2019-b` mein do naye issue:** (1) is PDF ka internal page order printed footer numbers se
  match nahi karta — PDF page 9 aur 12 aapas mein swapped hain (baaki sab sahi order mein),
  manifest mein poora remap likha Stage C ke liye. (2) Q12-14 aur Q17-18 ka Hindi stem/options
  scan mein genuinely blurred hai (400-500 DPI pe dobara render karke bhi confirm kiya) —
  English se transcribe kiya, Hindi "illegible" mark kiya, guess nahi kiya.
- **`2020-a` mein structural difference:** Section-A mein 40 nahi, **48 objective questions**
  hain, candidate koi 40 chunta hai — Stage C/D ko fixed-40 assumption nahi lagani. Ye paper
  ek asli attempted answer-copy jaisa lagta hai (check/cross-out marks har MCQ pe), kuch jagah
  Hindi aur English side pe **alag-alag option marked** hain — F3 rule (marks kabhi source nahi)
  ko hi aur confirm karta hai.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression
  nahi.
- **Agla:** Stage B batch 5 — agle 2-3 papers (`2020-b, 2021, 2022, ...` se, 9 papers baaki).

### 2026-08-04 — Stage B bulk batch 3: `2018-a` done, `2019-a` excluded (F4)
- **Bana:** `data/quiz-bank/stage1-pages/2018-a/` — manifest + 16 page files (16 PDF pages,
  200 DPI vision-read). Backend `src/` ka koi file touch nahi hua.
- **Bada finding (F4, naya STOP):** `2019 a.pdf` khola to andar asli Bihar Board exam paper
  nahi mila — ek third-party **"Bihar Hints & Solution — CBSE Xth Board Examination-2018-19"**
  guide-book nikla: sirf English, MCQ answers pehle se asterisk se marked, header "CBSE" (Bihar
  Board se alag board). Mid-batch rukkar user ko dikhaya, do options diye (skip vs. alag tareeke
  se rakho) — user ne **skip** confirm kiya. `2019-a` ab `2017-b` jaisa permanently excluded,
  `stage1-pages/` mein iska folder kabhi nahi banega. `QUIZ_DATA_PIPELINE.md` §3.1 mein F4 likha
  gaya. **Usable unique paper count 20 se 19 ho gaya.**
- **2018-a mein 2 chhote data-quality note:** do jagah question-number ka leading digit page-top
  margin pe cropped mila (Q4, Q22/Q23) — text/options poori tarah saaf the, sirf numeral clip
  hua tha, sequence se number confirm kiya. Ek page (Q26-29) scan skewed/rotated tha par saaf
  padhne layak. Do chhoti Hindi/English wording mismatch bhi mili (Q10(i), Q29-D) — jaisi dikhi
  waisi transcribe ki, sudhari nahi.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression
  nahi.
- **Agla:** Stage B batch 4 — agle 2-3 papers, list ab `2018-b, 2019-b, 2020-a, ...` se shuru
  (12 papers baaki).

### 2026-08-04 — Stage B bulk batch 2: `2017-a` + `2017-c` + `2017-d`
- **Bana:** `data/quiz-bank/stage1-pages/2017-a/`, `2017-c/`, `2017-d/` — manifest + page files
  (27 PDF pages total: 12+7+8), PyMuPDF se 200 DPI PNG render karke vision se padha. `2017-b`
  MD5-verify karke skip kiya (F1 se confirm, `2017-a` ka exact duplicate). Backend `src/` ka
  koi file touch nahi hua.
- **Bada finding (dedup):** `2017-a` aur `2017-d` — do **alag PDF files** (MD5 confirm distinct)
  ka **poora 50-question set word-for-word identical** hai. `2017-a` ke paas answer key nahi,
  `2017-d` ke paas hai — Stage F link banayega to `2017-d` ki key dono papers ke liye kaam
  karegi. Parking Lot P-11.
- **Naya failure pattern (2x confirm hua):** `2017-c` aur `2017-d` dono ke answer key mein kuch
  jawab asli text nahi, balki **"देखें <year> ... का उत्तर"** (kisi doosre paper/shift ka
  reference) hain, jo hamare 21-PDF set mein confirm nahi hain. Stage E ko in 3 sawaalon ko
  unanswered treat karna hoga. Parking Lot P-10.
- **Format diversity:** `2017-a` bilingual (Hindi+English har line), `2017-c`/`2017-d` Hindi-only
  guide-book style with per-subject Group A/B numbering restart — teeno alag layout se pipeline
  ka Stage B approach (raw hi/en capture, jo dikha wahi likho) sab pe kaam kiya.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression
  nahi.
- **Agla:** Stage B batch 3 — agle 2-3 papers (`2018-a`, `2018-b`, aur ek aur).

### 2026-08-04 — Stage B bulk batch 1: `2016-b` + `2016-c`
- **Bana:** `data/quiz-bank/stage1-pages/2016-b/` aur `2016-c/` — manifest + 8 page files har paper
  ke liye (16 PDF pages total), PyMuPDF se 200 DPI PNG render karke vision se padha. Backend
  `src/` ka koi file touch nahi hua.
- **Bada finding:** dono papers mein **printed answer key hai** (pilot wale `2016-a` mein nahi thi).
  Par `2016-b` ka key Group A+B dono cover karta hai, `2016-c` ka key sirf Group A (Q1-29) tak —
  Q30 aur poora Group B (20 MCQ) us paper mein answer-key-less hai, Stage E ko textbook/repeat route
  leni hogi in dono ke liye.
- **Data-quality signal:** "resistance ka SI unit = Ampere" (sahi: Ohm) ki wahi galti **teesri baar**
  mili — pehle pilot mein pen-mark, ab dono naye papers ke printed key mein bhi. Confirms Stage E ka
  textbook cross-check printed key pe bhi zaroori hai, sirf pen-marks pe nahi.
- **Parking Lot mein P-9 gaya:** pilot ke `2016-a` manifest mein `sourceMd5` field galat nikla (asal
  mein `2016-c.pdf` ka hash likha tha) — content verify kiya, sirf field-level typo hai, koi content
  mix-up nahi. Chhota fix hai, is session mein nahi kiya (blocker nahi tha).
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression nahi.
- **Agla:** Stage B batch 2 — agle 2-3 papers (`2017-a`, `2017-c`, `2017-d`; `2017-b` skip hoga,
  `2017-a` ka exact duplicate hai — F1 finding, MD5 verify kiya).

### 2026-08-04 — Pilot Stage G: review queue + final health (Pilot COMPLETE)
- **Bana:** `backend/scripts/quiz-bank/buildReview.js` + `npm run quiz:review` → output
  `data/quiz-bank/review/queue.json` + `data/quiz-bank/reports/health.json`. Backend `src/` ka
  koi file touch nahi hua.
- **Result: queue 0 open items** — expected for a solo-paper pilot (0 conflicts to compare
  against, 0 near-dup clusters, 0 low-OCR pages, 52/52 mapped, marks already matched at Stage C).
  Health: 20 objective questions, **100% language-complete, 100% L3+**, 20/52 usable in quiz
  (32 subjective permanently excluded), 52/52 chapter-mapped.
- **Logic verified with a synthetic fixture** (not touching real data) since the real bank has
  no queue-worthy issues to exercise the code against: all 6 categories (answer-conflict,
  language-missing, near-duplicate, low-ocr-confidence, chapter-unmapped, marks-mismatch) fire
  correctly, and a matching `review/resolved.json` decision makes an item disappear permanently
  (P4) — confirmed both full-resolve and partial-resolve cases.
- **P5 confirm hua:** `queue.json` byte-identical on re-run. `health.json` only `generatedAt`
  changes — allowed, it's a `reports/` file (same convention as `reports/survey.json`), not
  pipeline stage-data.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression nahi.
- **Pilot (Stage P) ka DoD poora tick ho gaya** — `reports/pilot-findings.md` mein confirm.
- **Agla:** user "haan, aage badho" bole to Stage B baaki 19 papers pe shuru (naya session,
  Rule 1 — ek session = ek phase/stage).

### 2026-08-04 — Pilot Stage F: dedup (solo) + chapter mapping
- **Bana:** `backend/scripts/quiz-bank/buildBank.js` + `npm run quiz:bank` → output
  `data/quiz-bank/bank/{questions,clusters,id-ledger}.json`. Backend `src/` ka koi file
  touch nahi hua.
- **Chapter mapping 52/52 (100%)** — exit criteria ka target 85% se bahut upar. Tareeka fuzzy
  title-match nahi, ek fixed formula hai: question text embed karo, sabse najdeeki chunk ka
  already-validated `section` + `chapter_no` metadata seedha `chapterId` bana deta hai
  (`Physics` + `1` → `science.physics.chapter-01`). Spot-check kiya (31-ii near-sightedness
  → Human Eye chapter, sahi).
- **Dedup (A8/A9) chala, jaisa expect tha 0 mila** — solo paper hai, isliye asli duplicate ho
  hi nahi sakta. **0 exact-match merge, 0 near-dup cluster proposed**, 52 questions → 52
  canonical entries. Code path (fingerprint, `id-ledger.json` permanent ID assignment,
  `clusters.json`) test ho gaya — asli test 19 baaki papers ke saath hoga.
- **Ek real bug pakda aur fix kiya isi session mein** (Parking Lot nahi gaya — apna hi naya
  code tha): `stage4-answers` ke paper object mein `year` field hai hi nahi, sirf `paperId`.
  Fix: year `paperId` se parse hota hai (P3 ka extension). Isके bina `appearances[].year` aur
  `years[]` hamesha `null` deta — repeat-detection feature (headline feature) khud khaali
  rehta.
- **P5 confirm hua:** dobara chalane pe 0 embedding call (52/52 cache hit), byte-identical file.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression
  nahi.
- **Pilot ke saare 8 sawaal ab bhar chuke** (`reports/pilot-findings.md`) — sirf **Stage G**
  (review + health report) baaki hai Pilot poora karne ke liye.
- **Agla:** Stage G pilot — review queue + `reports/health.json`. Isके baad Pilot DoD (§7 Stage
  P) tick hoga aur user "haan, aage badho" bolega tab baaki 19 papers pe Stage B shuru hoga.

### 2026-08-04 — Pilot Stage E: textbook-verified answers
- **Bana:** `backend/scripts/quiz-bank/buildAnswers.js` + `npm run quiz:answers` → output
  `data/quiz-bank/stage4-answers/2016-a.json`. Is paper mein printed key nahi hai (F3) aur
  abhi sirf ek hi paper process hua hai (repeat-match ke liye doosra saal nahi hai), isliye
  har MCQ ka answer Zuno ke apne RAG retriever se `data/class-10/science/` ke against
  textbook-verify hua — schema (§9) ke mutabik akela textbook-verification bhi seedha L3 deta hai.
- **Pehle run mein ek real galti pakdi gayi:** 20 mein se 18 verified hue, par 31-ii
  (near-sightedness lens) ka jawab **"Convex" aaya — jo galat hai (sahi: Concave)**. Root cause:
  retrieved 5 chunks sab textbook-correct the, par sabse saaf sentence ("Myopia is corrected by
  using a concave lens") rank 8 pe tha, top-5 se bahar — jo mila usme ek 2-column comparison
  table tha jise LLM ne galat column se jod diya, confidently.
- **Fix (do part):** (1) `topK` 5 se badha ke 8 kiya — saaf sentence ab range mein aata hai.
  (2) Prompt ko "verbatim quote" require karne wala banaya, **aur code khud check karta hai**
  ki quote excerpt mein sach mein mojood hai ya nahi (LLM ke paraphrase pe bharosa nahi kiya) —
  isi check ne 31-ii ka galat jawab pehle hi pakad liya hota. PROMPT_VERSION v2.
- **Result (dobara run):** 20 mein se **16 verified (L3)**, 4 unverified — 31-ii ab **sahi
  (Concave)** aata hai. Maine pehle se haath se verify kiye hue 8 sawaalon (pilot-findings.md
  F3 table) se cross-check kiya: **8/8 match, 0 galat.** 2 sawaal (31-i, 31-xviii) v1 mein
  "verified" the par v2 ke strict check mein "unverified" ban gaye — dono mein evidence ek
  paraphrase tha, ek asli quote nahi (safe trade-off, galat jawab nahi, sirf conservative).
- **P5 confirm hua:** dobara chalane pe 0 LLM call (20/20 cache hit), byte-identical file.
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression
  nahi (koi `src/` file touch hi nahi hui).
- **2 naye Parking Lot items:** P-7 (`rag:test-retriever` khud broken, missing `connectDB()`)
  aur P-8 (handwritten-mark notes `flags[]` mein propagate nahi hote) — dono real, dono kisi
  DoD ko rokte nahi.
- **Human-review mechanism ban gaya:** user ne baaki 4 unverified sawaalon ka jawab khud
  research karke diya (mirror=virtual, CO2=0.03%, autotrophic=all, largest gland=liver). Seedha
  output file mein likhna galat hota (P2 ke मुताबिक har re-run poori file dobara banata hai —
  uska research mit jaata). Isliye pipeline ka already-designed mechanism ab wire kiya:
  `data/quiz-bank/review/resolved.json` (§10) — script isko load karta hai, jo sourceId isme
  ho uska jawab **kabhi automation se overwrite nahi hota**, LLM/RAG call bhi skip ho jaata hai.
  `source: "human"`, confidence `L4`. **Final: 20/20 resolved** (15 textbook L3 + 5 human L4) —
  5wan (31-xvi) bhi add hua, jawab pilot-findings.md mein pehle se hi haath-verify tha (F3
  table), user ne confirm kiya.
- **Ek chhoti si LLM-variance note:** cache khaali karke dobara chalane pe (16 se 15 verified)
  — ek sawaal jo pehle exact-quote se pass hua tha, dusri baar LLM ne thoda alag paraphrase
  diya jo grounding-check fail ho gaya. Galat jawab kabhi nahi bana, sirf ek extra "unverified"
  ban gaya. Cache intact hone par output bilkul stable hai (0 LLM call, same result).
- **Agla:** Stage F pilot — dedup (solo, sirf ek paper) + chapter mapping.

### 2026-08-03 — Pilot Stage D: structure + 3 languages
- **Bana:** `backend/scripts/quiz-bank/buildQuestions.js` + `npm run quiz:questions` → output
  `data/quiz-bank/stage3-questions/2016-a.json` (§5.2 schema) aur `_hinglish-cache.json`.
  Backend `src/` ka koi file touch nahi hua.
- **Result:** 52/52 question mein Hindi + English + **Hinglish** teeno. 120 unique string,
  10 LLM call. Dobara chalane pe **0 call, byte-identical** file (P5 ✅).
- **QC ne 3 asli galti pakdi** (prompt v1): "Misal **of** phytohormone hai" (English ghusa),
  word order ulta, "baifokal" (technical term phonetic). Prompt v2 mein 4 naye rule daale,
  poora regenerate kiya → 120/120 clean. Full stop wala rule **code mein** gaya (source se
  decidable hai), prompt mein nahi. Cache key mein prompt version hai, isliye rule badalte hi
  sab apne aap dobara banta hai.
- **`usableInQuiz` abhi 52/52 pe `false`** — sahi hai, kyunki answer Stage E se aayega.
  Is paper se quiz ke liye 20 MCQ hi candidate hain (32 subjective permanently bahar).
- **Baseline:** pehle 🟢🟢🟢 + `chat-db-models` 🔴 (P-6) · baad mein bilkul wahi. Koi regression nahi.
- **Agla:** Stage E pilot — 20 MCQ ke answers, textbook route se (printed key hai hi nahi, F3).

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
