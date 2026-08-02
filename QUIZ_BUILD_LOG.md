# Quiz System — Build Log

> **Ye living state hai.** Har session ke end mein update hoti hai.
> Rules `QUIZ_EXECUTION_PROTOCOL.md` mein hain · Spec `QUIZ_SYSTEM_BLUEPRINT.md` mein hai
>
> **Ye file hamesha chhoti rahegi.** Purana session history neeche collapse hota jayega.

---

## 📍 ABHI KAHAN HAIN

| | |
|---|---|
| **Current Phase** | **Phase 0** — Prerequisite: chapter completion ko actually fire karana |
| **Status** | 🟡 Ready to start — abhi shuru nahi hua |
| **Branch** | ⚠️ decide karna hai — neeche "Branch decision" dekho |
| **Last session** | 2026-08-02 — blueprint audit + protocol setup |

### ⚠️ Phase 0 shuru karne se pehle — ek decision pending

`stalefilefixes` branch pe commit `2d380cd` ("stale file fixed") hai jo **abhi tak `main` mein merge nahi hua**. Current `quiz` branch `main` (0d69585) ke barabar hai — matlab usme wo cleanup nahi hai.

Decide karna hai: `stalefilefixes` ko pehle `main` mein merge karein, phir Phase 0 uske upar se branch ho? Ya alag chalne dein?

*(Recommendation: pehle merge kar do — ye sirf doc/cleanup changes hain, koi code risk nahi, aur baad mein branch tangle nahi hoga.)*

---

## 🎯 PHASE 0 — Definition of Done

> Full analysis: `QUIZ_SYSTEM_BLUEPRINT.md` §7 · Phase spec: §17 Phase 0
> **Ye quiz feature nahi hai** — ye shipped code ka ek bug hai jiske bina quiz gate ban hi nahi sakta.

**Blast radius — sirf ye file:**
- `backend/src/ask/step7.saveAndRespond.js`

**Code:**
- [ ] Line ~192: step-5 destructure mein `retrievedContext` add karo
- [ ] Line ~309: `isComplete` ab `retrievedContext === 'CHAPTER_COMPLETE'` test kare (abhi `retrieval?.retrievedContext` hai jo hamesha `undefined` deta hai)

**Verify (dekha jayega, maana nahi jayega):**
- [ ] Focus Mode mein ek chapter ke saare core topics khatam karo → MongoDB mein us chapter ka `chapter_progress.status` **`'completed'`** ho jaye *(abhi chup-chaap `in_progress` hi rehta hai)*
- [ ] `study_events` collection mein ek `chapter_completed` document aaye *(abhi kabhi nahi aata)*
- [ ] Regression: normal mid-chapter turn abhi bhi `upsertChapterProgress` se progress likhe, aur chapter ko galti se complete **na** kare

**Regression:**
- [ ] Baseline test suite green — baseline se compare kiya gaya
- [ ] `npm run test:golden` green (ask pipeline touch ho raha hai)

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

---

## 🗺️ PHASE BOARD

| Phase | Kya | Status |
|---|---|---|
| **0** | Prerequisite — chapter completion fire karana | 🟡 **Next** |
| 1 | Question models + seed data (backend) | ⚪ Pending |
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

### 2026-08-02 — Setup session (Phase 0 se pehle)
- **Kya hua:** Repo-wide stale file audit (4 orphan debug scripts delete, `PROBLEMS.md` archive, doc fixes) → commit `2d380cd` on `stalefilefixes`.
- **Phir:** `QUIZ_SYSTEM_BLUEPRINT.md` ka full audit live code ke against. **3 blocker, 3 internal contradiction, 5 factual mismatch** mile — sab file mein `[AUDIT]` blocks + naya §18 changelog ban ke inline fix ho gaye. Blueprint 1279 → 1780 lines.
- **Sabse bada finding:** chapter-completion hook (`step7:309`) dead code hai — isi wajah se naya **Phase 0** bana.
- **Setup:** `QUIZ_EXECUTION_PROTOCOL.md` + ye log file banayi, `CLAUDE.md` mein pointer add hua.
- **Agla:** branch decision, phir Phase 0.
