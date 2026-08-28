# PROJECT_STATE.md — Zuno

> **This is the single source of truth for "what exists right now".**
> Any AI agent or developer starting work on this repo MUST read this file first.
> Last verified: 2026-08-28 (verified against `main` @ 300 commits, not from memory)

---

## 1. What Zuno is

An AI tutor for **Bihar Board Class 10 Science** students.

Students ask in Hindi / Hinglish / English. Zuno answers in simple Roman-script
Hinglish, using **only** curated study content. It never answers from general
LLM knowledge.

**Final goal (owner's words):** production-grade app serving 50,000+ users, helping
students learn concepts, prepare for exams, track progress, and get light emotional
support when stressed.

**Current stage:** pre-launch. Launching to a small group of real students within days.

---

## 2. Verified state — what is actually built

Everything below was verified by reading `main` on 2026-08-28. Not assumed.

### Backend — 108 JS files in `backend/src/`

| System | Status | Where |
|---|---|---|
| Ask pipeline (7 steps, 9 intents) | ✅ Working | `backend/src/ask/` (11 files) |
| RAG (Atlas `$vectorSearch` + reranker) | ✅ Working | `backend/src/rag/` (8 files) |
| Intent Router (per-intent prompts) | ✅ Working | `backend/src/ask/intentRouter.js` |
| Auth (JWT + Google OAuth + email verify) | ✅ Working | `backend/src/auth/`, `controllers/auth.controller.js` |
| Quiz system (generate/submit/history/detail) | ✅ Working | `backend/src/services/quiz/` (5 files) |
| Exam knowledge (marks, weightage) | ✅ Working | `backend/src/knowledge/examKnowledgeService.js` |
| Chapter progress tracking | ✅ Working | `models/chapterProgress.model.js` |
| Support / feedback | ✅ Working | `routes/support.routes.js` |
| Redis cache (embedding + retrieval) | ✅ Working | `backend/src/cache/` (4 files) |
| Rate limiting (7 limiters) | ⚠️ Partial | `middlewares/rateLimiters.js` — see Known Issues |

**Routes (8):** ask, auth, chapterProgress, health, quiz, session, studyMap, support

**Models (10):** chapterProgress, chatHistory, chatSession, chunk, question,
quizAttempt, quizSession, studyEvent, supportRequest, user

### Frontend — 51 files in `frontend/src/`

**Pages (10):** Landing, Login, Register, ForgotPassword, ResetPassword,
VerifyEmail, AuthCallback, Chat, Quiz, Support

**Stack:** React 19 + Vite 6 + MUI v9 + Redux Toolkit + react-router v7

### Content

| Type | Count | Location |
|---|---|---|
| Science chapter files (Markdown) | **16 chapters** + 1 overview = 17 files | `data/class-10/science/` |
| Quiz questions (raw bank) | **1,126** | `data/quiz-bank/bank/questions.json` |
| Quiz chapter seed files | 16 | `data/quiz-bank/science/` |
| Exam pattern data | 1 | `data/class-10/global/exam_patterns.json` |

**Subject coverage:** Science only. Maths, Hindi, English, Social Science,
Sanskrit = **0**. This is a deliberate v1 scope decision — see `ADR-007`.

### Infrastructure

| Piece | Current | Note |
|---|---|---|
| Backend | Render **FREE** | ⚠️ Sleeps after 15 min. Cold start ~50s. Must upgrade before launch. |
| Frontend | Vercel | OK |
| Database | MongoDB Atlas | OK for now |
| Cache / rate limit | Upstash Redis **free** | ⚠️ ~10k commands/day ceiling |
| Domain | Purchased | — |
| Email | Official mail set up | — |
| SEO | ✅ Merged to `main` 2026-08-28 | Sitemap, meta tags, OG image, robots.txt, build-time pre-rendering of `/` and `/support` for crawlers |

### Deployment

| What | From | Notes |
|---|---|---|
| Backend | Render, from `main` | Start command: `node scripts/build-curriculum-index.js && node src/server.js` |
| Frontend | Vercel, from `main` | Build now runs `vite build && npx playwright install chromium && node scripts/prerender.js` — verified working 2026-08-28 |
| Health check | `GET /health` | Note: **not** under `/api/v1` — known inconsistency, kept as-is |

⚠️ Deploying from any branch other than `main` risks shipping a partial product.

### Verified clean (2026-08-28)

- `.env` has never been committed to git history
- `.env`, `.env.local`, `.env.*.local` are all gitignored
- No API keys (`sk-*`, `AIza*`) found anywhere in tracked files

### Missing — flagged, not yet decided

| Gap | Why it matters |
|---|---|
| **No privacy policy / terms page** | Users are ~15-year-old minors. Name, email, and full chat history are collected. India's DPDP Act 2023 has specific provisions for children's data. Verified: no such route in `frontend/src/App.jsx`. |
| **No usage reporting** | `models/studyEvent.model.js` logs events, but nothing reads them. There is currently no way to know whether students are actually using Zuno. |
| **No documented rollback** | No written procedure to revert a bad Render/Vercel deploy |
| **No OpenAI spend cap noted** | An abuse loop or bug could produce an unbounded bill |

All four are tracked in `STAGE1_DONE.md` sections F and G.

---

## 3. Branch state — READ THIS BEFORE ANY WORK

**`main` is the source of truth.** All audits and fixes happen on branches cut
from `main`.

Updated 2026-08-28:

| Branch | Status |
|---|---|
| `main` | ✅ Source of truth. Has quiz system + SEO work + this project system. |
| `seo-work` | ✅ **Merged into `main`** 2026-08-28. One conflict in `ChatPage.jsx` (Helmet wrapper vs. QuizModal) resolved by keeping both. Full `npm run build` verified green post-merge, including the new Playwright pre-render step. Safe to delete. |
| `quiz-phase0.5-bulk` | 🧊 **Frozen — will not be merged.** See `docs/decisions/010-freeze-quiz-bulk-branch.md`. Its finished output (the 1,126-question bank) already reached `main` via `quiz-phase1`; a byte-diff confirmed `data/quiz-bank/bank/questions.json` is identical on both branches. The branch itself is kept as a rebuildable pipeline for later, not deleted. It had never been pushed to GitHub before today — pushed 2026-08-28 as a backup, still frozen and unmerged. |

**Merged and safe to delete:** `quiz`, `quiz-phase1..4`, `global`, `profile`,
`logo`, `feat/support-page`, `stalefilefixes`, `DECIDER_GREETING_FIX`,
`STREAM_FAILURE_FIX`, `codex-curriculum-resolvers`, `seo-work`

### ⚠️ Lesson learned (2026-08-28) — two, from the same day

**1. Audit the wrong branch.** A full pipeline audit ran on `seo-work`, 30
commits behind `main`. Two findings were reported as bugs that were **already
fixed** on `main` (frontend SSE `JSON.parse` guard, null-payload handling).
This is why `AUDIT_RULES.md` Rule 1 exists — always audit `main`, always check
divergence first.

**2. `git diff` is not `git merge`.** The first read of `seo-work` and
`quiz-phase0.5-bulk` used raw `git diff --stat` against `main`, which shows
files as "deleted" whenever the *other* branch never touched them — not
because merging would delete anything. This was reported as a real risk
("quiz system could disappear"). A real three-way merge test
(`git merge --no-commit --no-ff`, inspected, then aborted) showed both merges
were safe, with only small, resolvable conflicts. **Always test a real merge
before describing one as risky — a diff alone can't tell you what a merge
will do.**

---

## 4. Known issues — verified on `main`, 2026-08-28

These are **BROKEN** (reproducible), not opinions. See `STAGE1_DONE.md`.

| # | Issue | Location |
|---|---|---|
| BUG-1 | Decider parse error returns `needsRetrieval: false`, causing a false "topic not in syllabus" reply | `ask/step4.decideRetrieval.js:210` |
| BUG-2 | Unknown intent falls back to `GREETING`, so a science question is treated as small talk and increments the drift counter | `ask/step4.decideRetrieval.js:77` |

> **BUG-1 + BUG-2 — fix in progress** (branch `bug1-decider-structured-output`).
> Approach: convert the decider chain to `withStructuredOutput` + `intent` enum;
> delete the parse-error and unknown-intent fallbacks. See `BUG1_FIX_PLAN.md` and
> `ADR-011`. This is a Stage 1 slice of `BACKLOG.md` O2.
| BUG-3 | `CHOOSE_COURSE` memory whitelist is overwritten 180 lines later — chapter switching is dead code | `ask/step7.saveAndRespond.js:68` vs `:253` |
| BUG-4 | Decider prompt hardcodes "Cell structure" and "Atomic structure" as out of scope, but both exist in `data/` (`### Atomic number`, `## 4. Neuron / Nerve Cell`) | `prompts/deciderPrompt.js:89,144` |
| BUG-5 | `retrieveChunksByTopicId` has no projection (pulls 3072-float embeddings) and `metadata.topic_ids` has no index → collection scan on every NEXT_STEP | `rag/retriever.js:105`, `models/chunk.model.js` |
| BUG-6 | Embedding cache stores Gemini fallback vectors under the OpenAI cache key for 30 days, silently corrupting retrieval after any OpenAI outage | `cache/embeddingCache.js:28` |
| BUG-7 | Science glossary is skipped for Devanagari answers because the Hindi branch returns early | `utils/languageDetector.js:98` |
| BUG-8 | `askApiLimiter` is keyed by raw IP. Under CGNAT / school networks, one student's usage blocks everyone. The quiz limiters already do this correctly — copy that pattern. | `middlewares/rateLimiters.js:40` |

---

## 5. Testing

| What | State |
|---|---|
| Golden set | **42 cases** in `backend/test/golden-queries.json` |
| Intents covered | GREETING 8, CONCEPT_QUESTION 13, OUT_OF_CONTEXT 6, EXPLAIN_MORE 5, NEXT_STEP 4, CHOOSE_COURSE 4, UNSAFE_OR_ABUSIVE 2 |
| **Not covered** | `EXAM_INFO` (0), `EMOTIONAL_SUPPORT` (0), multi-turn (0) |
| Quality checks | Substring matching only — **warns, never fails** |

Other test scripts: `test:chunks`, `test:study-map`, `test:curriculum-resolvers`,
`test:chat-db-models`, `rag:test-retriever`, `test:golden`

### ⚠️ Two prescribed test commands are broken on `main` (verified 2026-08-28)

Both are pre-existing and tracked in `STAGE1_DONE.md` Section D (D4, D5) — not new.

| Command | Problem |
|---|---|
| `test:chat-db-models` | `scripts/test-chat-db-models.js:4` imports `src/models/chatState.model.js`, which does not exist (state was folded into `chatSession.model.js`). Test crashes on load with `ERR_MODULE_NOT_FOUND`. |
| `test:golden` | `scripts/run-golden-set.js` needs a live server on `localhost:5001` — it is **not** mocked, despite CLAUDE.md describing it as "mocked decider/responder scenarios". Without a running dev server it reports 0 queries and exits 0 (a silent no-op). |

Working baseline (the 3 that pass): `test:chunks`, `test:study-map`,
`test:curriculum-resolvers`.

---

## 6. Cost model — measured, not guessed

From the project's own config: `SESSION_TOKEN_LIMIT = 55,000` over roughly
9 turns → **~6,100 tokens per turn** (~5,500 input + ~700 output).

At gpt-4o-mini rates ($0.15/1M input, $0.60/1M output):

**~$0.00125 per turn (~₹0.11)**

| Daily active users | Turns/day (@15) | LLM cost/month |
|---|---|---|
| 500 | 7,500 | ~$280 |
| 5,000 | 75,000 | ~$2,800 |
| 50,000 | 750,000 | **~$28,000** |

**Biggest available lever: an answer cache.** Students repeat the same questions.
Not built yet. Estimated 40–60% traffic reduction. Tracked in `BACKLOG.md`.

Secondary levers: prompt caching (static system prefix), and a deterministic
pre-router so greetings never reach an LLM.

---

## 7. Where the current stage is

See `STAGE1_DONE.md` for the launch checklist and the definition of "done".
Do not start Stage 2 work before every Stage 1 box is ticked.
