# STAGE 1 — LAUNCH

> **This file is the definition of "done" for Stage 1.**
> When every box is ticked, Stage 1 is finished. It does not get reopened.
> Nothing outside this file is Stage 1 work. Everything else lives in `BACKLOG.md`.

**Goal:** 20–50 real Bihar Board students use Zuno for a week without it breaking.

**Explicitly NOT the goal:** 50,000 users. Perfect code. New subjects. New features.
Those are Stage 2 and Stage 3.

**Target date:** _____________ (owner fills in)

---

## A. Repository hygiene

- [x] **A1.** `seo-work` merged into `main` (2026-08-28). One conflict in
      `ChatPage.jsx` resolved by keeping both the Helmet SEO wrapper and the
      QuizModal. Real merge tested with `--no-commit --no-ff` before committing.
- [x] **A2.** `quiz-phase0.5-bulk` decision made and recorded — **ADR-010: freeze,
      do not merge.** Its finished output (1,126 questions) was confirmed
      byte-identical to `main`'s already, via `quiz-phase1`.
- [x] **A3.** Merged branches deleted (2026-08-28): `quiz`, `quiz-phase1..4`,
      `global`, `profile`, `logo`, `feat/support-page`, `stalefilefixes`,
      `DECIDER_GREETING_FIX`, `STREAM_FAILURE_FIX`, `codex-curriculum-resolvers`,
      `seo-work`, plus a redundant branch `seo` (a superseded checkpoint of
      `quiz-phase0.5-bulk` — every commit on it already existed there).
      Local branches now: `main`, `quiz-phase0.5-bulk` only.
- [x] **A4.** `main` builds clean: `cd frontend && npm run build` — verified
      2026-08-28, including the new Playwright pre-render step. Quiz components
      (`QuizModal`, `QuizPage`) confirmed present in the build output.
- [x] **A5.** `PROJECT_STATE.md` matches reality after the merges — updated
      2026-08-28

---

## B. Infrastructure

- [~] **I1.** Render upgraded off the free tier — cold start under 3 seconds
      *(Free tier sleeps after 15 min. The first student each morning waits ~50s and leaves.)*
      **DEFERRED by owner 2026-08-28** — stay on free tier for the initial small-group
      launch; paid plan to be taken later. Accepted risk: first request after 15 min
      idle has a ~50s cold start. Acceptable for 20–50 known students who are told to
      wait; revisit before any wider launch.
- [x] **I2.** `USE_INTENT_ROUTER=true` confirmed in Render's environment
      — verified by owner 2026-08-28, present and correct in production env.
- [x] **I3.** All required env vars present on Render (compare against `backend/.env.example`)
      — verified by owner 2026-08-28, all present.
- [~] **I4.** Error monitoring live (Sentry free tier, or structured error logging you actually read)
      **DEFERRED by owner 2026-08-28** — to be decided later. Accepted risk: during the
      initial small-group launch there is no automatic alert when the backend errors;
      relying on students reporting problems and manual Render log checks. Revisit
      before wider launch — a student-facing product should have this.
- [~] **I5.** Upstash Redis usage checked against the free-tier ceiling; upgrade path known
      **DEFERRED by owner 2026-08-28** — stay on Upstash free tier for now; upgrade
      plan to be decided later. Accepted risk: ~10k commands/day ceiling. At 20–50
      students this is unlikely to be hit; revisit if usage grows.

---

## C. The 8 verified bugs

Each one follows the same protocol: **failing test first → fix → passing test.**
No fix is marked done on assertion alone.

- [ ] **BUG-1 fix** — decider parse error must not produce a false "not in syllabus"
      `ask/step4.decideRetrieval.js:210`
      **Approach:** convert the decider chain to `model.withStructuredOutput(schema)`
      (9-value `intent` enum); delete the `parse_error` fallback branch. Removes the
      cause (fallible free-text JSON parsing) per `AUDIT_RULES.md` Rule 4 — not a
      symptom patch. See `BUG1_FIX_PLAN.md` and **ADR-011**.
- [ ] **BUG-2 fix** — unknown intent falls back to `CONCEPT_QUESTION`, never `GREETING`
      `ask/step4.decideRetrieval.js:77`
      **Approach:** same change as BUG-1 — the `intent` enum in the decider schema makes
      an unrecognised intent value structurally impossible, so the fallback branch in
      `normalizeDecision()` becomes unreachable and is removed. See `BUG1_FIX_PLAN.md`
      and **ADR-011**.
- [ ] **BUG-3 fix** — `CHOOSE_COURSE` either works or the dead whitelist entry is removed
      `ask/step7.saveAndRespond.js:68` / `:253`
- [ ] **BUG-4 fix** — hardcoded out-of-scope topic list removed from the decider prompt
      `prompts/deciderPrompt.js:89,144`
- [ ] **BUG-5 fix** — add `{ embedding: 0 }` projection + index on `metadata.topic_ids`
      `rag/retriever.js:105`, `models/chunk.model.js`
- [ ] **BUG-6 fix** — never cache an embedding produced by the fallback provider
      `cache/embeddingCache.js:28`
- [ ] **BUG-7 fix** — science glossary applies to Devanagari answers too
      `utils/languageDetector.js:98`
- [ ] **BUG-8 fix** — `askApiLimiter` keyed by identity, not raw IP (copy the quiz limiter pattern)
      `middlewares/rateLimiters.js:40`

---

## D. Testing

- [ ] **D1.** Golden set covers all 9 intents — `EXAM_INFO` and `EMOTIONAL_SUPPORT` currently have **zero** cases
- [ ] **D2.** At least 5 multi-turn cases (currently zero) — the pipeline is stateful and nothing tests state
- [ ] **D3.** Quality checks **fail** the run instead of only warning
- [ ] **D4.** `npm run test:golden` passes 100% on `main`
- [ ] **D5.** Baseline test suite passes: `test:chunks`, `test:study-map`, `test:curriculum-resolvers`, `test:chat-db-models`

---

## E. Real students

- [ ] **E1.** 10+ real students used Zuno for one week
- [ ] **E2.** Zero crashes and zero blank/error answers in that week
- [ ] **E3.** Their actual questions collected and added to the golden set
- [ ] **E4.** Feedback gathered — what confused them, what they liked

---

## F. Legal and student safety

> **Zuno's users are Class 10 students — roughly 15 years old. They are minors.**
> India's DPDP Act 2023 has specific provisions for processing children's data.
> Zuno currently collects name, email, and full conversation history, and has
> **no privacy policy or terms page** (verified 2026-08-28: no such route exists
> in `frontend/src/App.jsx`).
>
> This is not legal advice. It is a flag that this needs a decision before a
> public launch, not after.

- [ ] **F1.** Privacy policy page published, linked from footer and signup
- [ ] **F2.** Terms of use page published
- [ ] **F3.** Decision recorded (as an ADR) on how minors' data is handled —
      parental consent, data retention period, deletion request path
- [ ] **F4.** Account/data deletion path exists (even if manual via support email)
- [ ] **F5.** Google OAuth consent screen reviewed — scopes minimal, app name/logo correct

---

## G. Operations — "what if it breaks"

- [ ] **G1.** **OpenAI hard spend cap set** on the account
      *(A loop, a bug, or abuse could otherwise produce an unbounded bill. 2-minute setting.)*
- [ ] **G2.** MongoDB Atlas backup verified — free/shared tiers have no automated
      backups. Losing the DB means losing every student's progress.
- [ ] **G3.** Rollback plan written down — how to revert Render and Vercel to the
      previous working deploy, in one page
- [ ] **G4.** A basic daily usage query or script exists — how many students,
      how many turns, how many errors.
      *(`models/studyEvent.model.js` already logs the events. Nothing reads them yet —
      verified 2026-08-28: no reporting script in `backend/scripts/`.)*
- [ ] **G5.** Support inbox confirmed working end-to-end — a student submits via
      `/support`, and a human actually sees it

---

## Exit criteria

**Every box above is ticked.**

When that happens:

1. Tag the commit `v1.0-launch`
2. Update `PROJECT_STATE.md`
3. **Stage 1 is closed.** It is not reopened by a later audit, a new idea, or a
   better approach. Those go to `BACKLOG.md` and are considered in Stage 2.

---

## Out of scope for Stage 1 — do not start these

These are real and worth doing. They are **not** Stage 1.

| Item | Stage |
|---|---|
| Structured output (JSON schema) | 2 |
| Answer cache | 2 |
| Hybrid search (BM25 + vector + RRF) | 2 |
| Removing the 12 defensive layers | 2 |
| Deterministic pre-router | 3 |
| Prompt caching | 3 |
| Maths / other subjects | 3 |
| Weakness/strength analytics | 3 |
| MongoDB / Redis scale-up | 3 |
