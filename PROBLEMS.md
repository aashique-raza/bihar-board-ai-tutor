# PROBLEMS.md — Bihar Board AI Tutor (Zuno)

**Generated:** 2026-06-03  
**Auditor:** Claude Sonnet 4.6 (deep read-only pass — all entries verified against actual code)  
**Base:** Goes beyond ANALYSIS.md — every item confirmed by reading the relevant source lines.

---

## How to Use This File

Pick any PENDING item, read the **Files** and **Current behavior** sections, and you have enough to start without asking follow-up questions. Items marked **Depends on** must be resolved first. Fix in the order: 🔴 → 🟠 → 🟡 → 🔵 → 🔐 → ⚪.

---

## 🔴 CRITICAL — Silent failures (broken right now, no error shown)

---

### BUG-001 — `lastTopic` and all doubt-context fields are silently discarded every turn

- **What**: The LLM writes `lastTopic`, `lastDoubtTopic`, `lastDoubtQuestion` into `memoryUpdate` every turn, but the allowlist in `sanitizeMemoryUpdate` strips them before DB save, so they are permanently null.
- **Why it matters**: Zuno tells the LLM what topic the student last studied and what they last asked in doubt mode. Since these are always null, the tutor has no continuity between turns. Follow-up questions ("iska example do", "aage batao") lose all context.
- **Current behavior**: Step 7 calls `sanitizeMemoryUpdate({ memoryUpdate: response.memoryUpdate })`. The loop only passes fields in `ALLOWED_STATE_FIELDS` (line 15–19 of step7). `lastTopic`, `lastDoubtTopic`, `lastDoubtQuestion` are not in this list, so they are dropped silently. MongoDB never receives them. On next turn, `formatMemoryForPrompt` (promptHelpers.js lines 63–65) reads `chatState.lastTopic` → always `null`.
- **Expected behavior**: `lastTopic`, `lastDoubtTopic`, `lastDoubtQuestion` should be persisted to MongoDB and sent to the LLM in subsequent turns.
- **Files**:
  - `backend/src/ask/step7.saveAndRespond.js` lines 15–19 — `ALLOWED_STATE_FIELDS` is missing these fields
  - `backend/src/models/chatSession.model.js` lines 29–72 — Mongoose schema has no `lastTopic`, `lastDoubtTopic`, `lastDoubtQuestion` fields
  - `backend/src/ask/promptHelpers.js` lines 55–66 — `formatMemoryForPrompt` reads these fields (always gets null)
  - `backend/src/prompts/tutorPrompt.js` lines 44–50 — tutor prompt template explicitly sets these fields in `memoryUpdate`
- **Depends on**: none
- **Effort**: S
- **Status**: FIXED
- **Resolution**: Added `lastTopic`, `lastDoubtTopic`, `lastDoubtQuestion` to `ALLOWED_STATE_FIELDS` in `step7.saveAndRespond.js` and to Mongoose schema in `chatSession.model.js`
- **Closed**: 2026-06-06

---

### BUG-002 — `step4.decideRetrieval.js` has no try/catch — raw LLM provider error reaches the student

- **What**: If the LLM provider (Groq/Gemini/OpenAI) returns a rate-limit error, auth failure, or network timeout during Step 4, the raw provider error message is sent directly to the student as a 500 response.
- **Why it matters**: Provider errors include internal details: model names, organization IDs, API key prefixes, rate limit quota numbers. Students see technical crash messages instead of a friendly fallback. No graceful degradation exists for Step 4.
- **Current behavior**: `decideRetrieval()` in step4 calls `await getDeciderChain().invoke(...)` at line 92 with no try/catch. The error propagates up through `askOrchestrator.js` → `ask.controller.js` (which does `next(error)`) → `error.middleware.js`, which returns `error.message` raw. Step 6 has a try/catch with a `createFallbackResponse`, but Step 4 has none.
- **Expected behavior**: Step 4 should have a try/catch. On any LLM error, it should fall back to a safe default decision object (e.g., `{ intent: 'CONCEPT_QUESTION', needsRetrieval: true, ... }`) and log the actual error server-side.
- **Files**:
  - `backend/src/ask/step4.decideRetrieval.js` lines 88–110 — missing try/catch entirely
  - `backend/src/ask/step6.generateResponse.js` lines 131–137 — shows the correct fallback pattern Step 4 should follow
  - `backend/src/middlewares/error.middleware.js` lines 1–14 — returns `error.message` raw
- **Depends on**: none
- **Effort**: S
- **Status**: FIXED
- **Resolution**: Added try/catch to step4.decideRetrieval.js and step6.generateResponse.js. Provider errors throw ProviderUnavailableError, caught centrally in askOrchestrator.js. Parse errors use safe defaults. consecutiveErrors tracked in chatState for context-aware student messages.
- **Closed**: 2026-06-06

---

### BUG-003 — `SourceChips` component built but never rendered — source attribution is invisible to students

- **What**: The entire RAG pipeline carefully retrieves, formats, and sends source attribution to the frontend, but `ChatMessage.jsx` never imports or renders `SourceChips`. Students never see where answers come from.
- **Why it matters**: Source attribution is a core product requirement. It is what distinguishes Zuno from a generic chatbot and allows students to verify answers against their textbook. The feature is completely built on the backend but silently invisible on the frontend.
- **Current behavior**: `backend/src/rag/sourceFormatter.js` formats source objects. `step7.saveAndRespond.js` includes them in `answerPayload.sources`. `App.jsx` spreads `answerPayload` into message objects (`createAnswerMessage`). `SourceChips.jsx` exists in `frontend/src/components/`. But `ChatMessage.jsx` does not import `SourceChips` and does not render `message.sources`. The `sources` array silently exists in every Zuno message object with no display.
- **Expected behavior**: For Zuno messages that have `message.sources.length > 0`, `SourceChips` should be rendered below the sections content.
- **Files**:
  - `frontend/src/components/ChatMessage.jsx` — entire file, no import of SourceChips, no rendering of sources
  - `frontend/src/components/SourceChips.jsx` — complete component, never imported anywhere
  - `backend/src/ask/step7.saveAndRespond.js` lines 119–137 — `sources` is in the API response
- **Depends on**: none
- **Effort**: S
- **Status**: WONT_FIX
- **Resolution**: Intentional product decision. Source chips made UI heavy and degraded student experience. Sources will not be displayed in the frontend.
- **Closed**: 2026-06-04

---

### BUG-004 — `EXPLAIN_MORE` intent sends `NO_RETRIEVED_CONTEXT` to tutor — student gets "content not found" when asking for clarification

- **What**: When a student says "nahi samajh aaya" or "dubara samjhao", the decider correctly identifies `EXPLAIN_MORE` but sets `needsRetrieval = false`. The tutor prompt's rule then fires: "If context is empty, state calmly that the material doesn't contain this topic." Student asking for re-explanation gets a "not found" response.
- **Why it matters**: This is the most common learning interaction — a student not understanding and asking again. The expected behavior (re-explain what was just taught) is impossible to trigger because the tutor prompt's empty-context rule overrides the intent.
- **Current behavior**: `deciderPrompt.js` line 33–35 sets `EXPLAIN_MORE → needsRetrieval=false`. `step5.retrieveContent.js` returns `retrievedContext = 'NO_RETRIEVED_CONTEXT'`. `tutorPrompt.js` system prompt says: "If the context is empty or missing, state calmly in the target script that the active material doesn't contain this specific topic." For `EXPLAIN_MORE`, the tutor should use `lastTutorResponse` and `history` to re-explain, but the empty-context guard conflicts with this.
- **Expected behavior**: For `EXPLAIN_MORE` intent, the tutor should receive an explicit instruction to re-explain the last response from history (rather than triggering the "no content" guard). Either: (a) re-retrieve the same topic's content using `lastTopic`, or (b) the tutor prompt should explicitly differentiate between "no content because topic is outside scope" and "no new retrieval needed because this is a clarification request."
- **Files**:
  - `backend/src/prompts/deciderPrompt.js` lines 33–35 — EXPLAIN_MORE routing
  - `backend/src/prompts/tutorPrompt.js` lines 28–29 — empty context rule
  - `backend/src/ask/step5.retrieveContent.js` lines 31–39 — bypass block
- **Depends on**: BUG-001 (lastTopic needed to re-retrieve)
- **Effort**: M
- **Status**: FIXED

---

### BUG-005 — Pure English questions get English answers, violating the core Hinglish rule

- **What**: When a student types a question in plain English (no Devanagari, no Hinglish signals), `languageDetector.js` returns `answerLanguage: 'english'`. The tutor then responds in English. CLAUDE.md states answers must always be in simple Roman-script Hinglish.
- **Why it matters**: Bihar Board students may write questions like "what is photosynthesis?" or "define refraction" in English. The system should always respond in Hinglish. English responses violate the core product rule and feel inconsistent.
- **Current behavior**: `detectQuestionLanguage()` (languageDetector.js lines 40–45): if the question has no Devanagari and no Hinglish signal tokens, it returns `{ answerLanguage: 'english' }`. `getAnswerLanguageInstruction('english')` returns "Write the final answer in simple English for a Class 10 student." The tutor follows this instruction and replies in English.
- **Expected behavior**: `answerLanguage` should default to `'hinglish'` for all non-Devanagari input. Only Devanagari-script questions should trigger `answerLanguage: 'hindi'`. English questions should be answered in Hinglish.
- **Files**:
  - `backend/src/utils/languageDetector.js` lines 40–45 — English fallback returns 'english' instead of 'hinglish'
  - `backend/src/utils/languageDetector.js` lines 85–93 — `getAnswerLanguageInstruction` handles all three cases; the English case should be removed or redirected to hinglish
- **Depends on**: none
- **Effort**: S
- **Status**: FIXED
- **Resolution**: (1) `detectQuestionLanguage()` English fallback ab `answerLanguage: 'hinglish'` return karta hai. (2) `getAnswerLanguageInstruction('english')` ab Hinglish instruction return karta hai (safety net). (3) `deciderPrompt.js` mein searchQuery instruction strengthen ki — Devanagari forbidden, English/Roman-script Hinglish only. (4) `normalizeDecision()` mein Devanagari guard add kiya — agar LLM ne Devanagari searchQuery diya toh `null` set hota hai aur warn log hota hai.
- **Closed**: 2026-06-06

---

### BUG-006 — `NEXT_STEP` intent has no downstream logic — always gives a context-free response

- **What**: The decider routes `NEXT_STEP` with `needsRetrieval = false` and a comment "we use studyMap logic downstream" — but no such downstream logic exists. Since `lastTopic` is never persisted (BUG-001), the tutor has no idea what topic was last covered.
- **Why it matters**: "Agla topic padhao" is one of the most natural student interactions. It should advance the lesson. Currently it either gives a generic response or asks the student to clarify what they want to study next.
- **Current behavior**: `deciderPrompt.js` line 28: "needsRetrieval=false (we use studyMap logic downstream)". No such logic exists in step5, step6, or step7. The tutor receives `NO_RETRIEVED_CONTEXT` and `lastTopic = null`. It cannot meaningfully continue the lesson.
- **Expected behavior**: For `NEXT_STEP`, the system should either (a) look up the next topic in the studyMap after `lastTopic` and retrieve content for it, or (b) at minimum, the comment should be removed and the decider should set `needsRetrieval = true` with a `searchQuery` derived from the active chapter's next topic.
- **Files**:
  - `backend/src/prompts/deciderPrompt.js` lines 26–28 — NEXT_STEP routing with false promise
  - `backend/src/ask/step5.retrieveContent.js` lines 31–39 — no special handling for NEXT_STEP
  - `backend/src/ask/step7.saveAndRespond.js` lines 15–19 — lastTopic not in allowlist (BUG-001 dependency)
- **Depends on**: BUG-001
- **Effort**: L
- **Status**: FIXED
- **Fixed date**: 2026-06-07
- **Resolution**: Implemented full NEXT_STEP pipeline — curriculumIndexLoader, nextTopicResolver, step5 NEXT_STEP handler, step6 CHAPTER_COMPLETE signal, step7 nextTopicSignal state update. Two additional bugs found and fixed during QA: getNextTopic null guard (nextTopicResolver.js:26) and buildTopicSearchQuery semantic query builder (step5). Retriever score inversion (see retriever fix commit) was masking the bug in integration tests — fixed separately.

---

### BUG-007 — `completedTopicIds` read from `chatState` but not in schema or allowlist

- **What**: `formatMemoryForPrompt` reads `chatState.completedTopicIds` (promptHelpers.js line 62), but this field is not in the Mongoose schema and not in `ALLOWED_STATE_FIELDS`. It is always `[]` in the LLM context.
- **Why it matters**: Lesson progress tracking silently does nothing. Even if the LLM sets this field in `memoryUpdate`, it gets dropped by the sanitizer (like `lastTopic`).
- **Current behavior**: `promptHelpers.js` line 62: `completedTopicIds: chatState?.completedTopicIds || []`. The schema (`chatSession.model.js` lines 29–72) has no `completedTopicIds` field. `ALLOWED_STATE_FIELDS` (step7, line 15–19) does not include it.
- **Expected behavior**: Either add `completedTopicIds` to the schema and allowlist, or remove it from `formatMemoryForPrompt` if it is not being used.
- **Files**:
  - `backend/src/ask/promptHelpers.js` line 62
  - `backend/src/ask/step7.saveAndRespond.js` lines 15–19
  - `backend/src/models/chatSession.model.js` lines 29–72
- **Depends on**: none
- **Effort**: S
- **Status**: FIXED
- **Fixed date**: 2026-06-07
- **Resolution**: completedTopicIds added to chatSession.model.js schema ([String], default []) and to ALLOWED_STATE_FIELDS in step7. Backend manages this field directly via nextTopicSignal — LLM instructed not to override it. Fixed together with BUG-006 as planned.

---

## Hidden Bugs Found During QA

---

### BUG-H01 — retriever.js cosine score inversion

- **File**: `backend/src/rag/retriever.js`
- **Found**: 2026-06-07 during BUG-006 API integration testing
- **Status**: FIXED (commit 1 of this session)
- **Description**: Commit 3ff9f01 added `1 - distanceScore` conversion under the incorrect belief that MemoryVectorStore returns cosine distance. It actually returns cosine similarity. This inverted all scores (e.g. 0.68 → 0.32), dropping every candidate below `minScore: 0.55`. Result: RAG returned 0 chunks for every API request since that commit. All responses were generated from LLM general knowledge — core product rule violation. Fixed by removing the conversion and using raw score. Verified via smoke test (scores 0.68-0.75 now pass filter correctly) and API integration tests (status: answered with real retrieved content).

---

## 🟠 STABILITY — Will crash or expose errors under real use

---

### STB-001 — Frontend `fetch()` has no timeout — UI hangs indefinitely on slow or failed backend

- **What**: `tutorApi.js` makes `fetch()` calls with no `AbortController` or timeout. If the backend is slow (LLM rate limit, cold-start latency) or down, the spinner runs forever. The user has no way to cancel.
- **Why it matters**: QA report documented 37-second and 94-second wait times. Students will close the browser or assume the app is broken. There is no recovery path without a page refresh.
- **Current behavior**: `tutorApi.js` lines 25–46: `fetch()` with no timeout signal. `isAsking` state is set to `true` and never cleared unless a response or error arrives. If the backend hangs, the `finally` block never runs.
- **Expected behavior**: Wrap fetch in `AbortController` with ~30-second timeout. On abort, throw a user-friendly error: "Zuno thoda busy hai abhi, thodi der baad try karo."
- **Files**:
  - `frontend/src/api/tutorApi.js` lines 36–43
- **Depends on**: none
- **Effort**: S
- **Status**: FIXED
- **Resolution**: `askTutor()` ab `signal` parameter accept karta hai. `App.jsx` mein `controllerRef` (AbortController) aur `timeoutRef` (60s timeout) add kiye — dono `useRef` mein. `handleAsk` `useCallback([])` mein wrap hai aur `controllerRef.current` se guard karta hai (double-submit impossible). Timeout fire hone ya Stop click hone par `AbortError` catch hoti hai aur student ko Hinglish message milta hai: "Zuno thoda busy hai abhi, thodi der baad try karo." `AskBar` mein Stop button add kiya (request in-flight hone par Send ki jagah dikha), `React.memo` wrap, aur 300ms `cancelCooling` guard. Port mismatch bhi fix kiya: `backend/.env` se duplicate `PORT=5000` hataya (5001 retain), `tutorApi.js` fallback `localhost:6000` → `localhost:5001`.
- **Closed**: 2026-06-07

---

### STB-002 — `npm run rag:query` points to a non-existent file

- **What**: `package.json` script `rag:query` points to `src/rag/query/pipelines/queryPipeline.js` which does not exist. Running the script crashes immediately with `MODULE_NOT_FOUND`.
- **Why it matters**: Developers testing RAG queries during development get a confusing error. The script is broken and has no recovery. The file path is a leftover from a deleted older architecture.
- **Current behavior**: `npm run rag:query` → `node src/rag/query/pipelines/queryPipeline.js` → `Error [ERR_MODULE_NOT_FOUND]: Cannot find package`.
- **Expected behavior**: Either remove the script entry, or replace it with a working query test script (e.g., `scripts/test-retriever.js` which already exists as `rag:test-retriever`).
- **Files**:
  - `backend/package.json` line 15
- **Depends on**: none
- **Effort**: S
- **Status**: FIXED
- **Resolution**: `rag:query` script entry `backend/package.json` se remove kar diya. Working alternative `rag:test-retriever` (`scripts/test-retriever.js`) pehle se exist karta hai.
- **Closed**: 2026-06-07

---

### STB-003 — No rate limiting — Groq/Gemini free-tier quota can be exhausted by a single user

- **What**: Any caller can POST to `/api/v1/ask` unlimited times with no throttling. Each request makes 2 LLM calls + 1 Gemini embedding call. On Groq free tier (30 requests/minute), 15 users hitting at the same time will immediately rate-limit the service.
- **Why it matters**: When quota is exhausted, all users get raw 429 errors (BUG-002 exposes these as plain text). The app goes completely dark until quota resets.
- **Current behavior**: `app.js` lines 1–34 — no rate limiting middleware at any level. No per-IP or per-session throttle exists.
- **Expected behavior**: Add `express-rate-limit` middleware on `/api/v1/ask` — e.g., 20 requests per IP per minute for MVP.
- **Files**:
  - `backend/src/app.js` — no rate limiting configured
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### STB-004 — Vector store cold-start latency hits the first student of each server process

- **What**: `vector-store.json` (600 vectors × 3072 floats each, with JSON wrapper) is read from disk and parsed synchronously on the first retrieval request. The `vectorStoreCache` then caches it for subsequent requests, but the first request after any server restart takes a large disk-read + JSON.parse hit.
- **Why it matters**: Combined with 2 LLM calls, the first request to a fresh server (or after nodemon restart during development) can exceed 30 seconds. Students get no feedback during this cold-start window.
- **Current behavior**: `vectorStoreLoader.js` lines 101–141: `loadLangChainMemoryVectorStore` reads the JSON file on first call. The cache stores the promise. First-request users wait for disk I/O + JSON.parse + LLM calls.
- **Expected behavior**: Pre-warm the vector store at server startup (not on first request). Call `loadRetrieverVectorStore()` in `server.js` after `connectDB()` succeeds.
- **Files**:
  - `backend/src/server.js` lines 7–15 — startup sequence, vector store not pre-warmed
  - `backend/src/rag/vectorStoreLoader.js` lines 101–141
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### STB-005 — No startup validation of required environment variables

- **What**: `env.js` only validates `PORT`, `NODE_ENV`, and `mongodbUri`. Missing `GROQ_API_KEY`, `GEMINI_API_KEY`, etc. are not detected at startup. They surface as cryptic errors on the first request that needs them.
- **Why it matters**: A deployment with a missing `.env` key fails only on first use, not at startup. The error message "GROQ_API_KEY or ... is required" reaches the error middleware and is sent to the student.
- **Current behavior**: `env.js` lines 18–22 — does not check LLM or embedding keys. `chatModel.js` `getRequiredEnv()` throws at chain-creation time (first request). `geminiEmbeddings.js` `getGoogleApiKey()` throws at first embedding call.
- **Expected behavior**: Validate all required env vars at server startup (`server.js`, after `dotenv.config()`). If any are missing, log a clear error and refuse to start.
- **Files**:
  - `backend/src/config/env.js` lines 18–22
  - `backend/src/server.js` lines 7–15
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### STB-006 — `CHAPTER_STORE_CACHE` in `retriever.js` has no TTL — stale vectors persist after `rag:index` re-run

- **What**: When `npm run rag:index` rebuilds the vector store and the server is NOT restarted, the in-memory `CHAPTER_STORE_CACHE` still holds old chapter-scoped stores built from the previous vector file. New content is never served until restart.
- **Why it matters**: After adding or updating study content (a common development task), developers must restart the server AND re-run rag:index. If they only run rag:index without restart, the server continues serving old vectors for focus-mode queries — silently.
- **Current behavior**: `retriever.js` lines 24, 61–91: `CHAPTER_STORE_CACHE` is a module-level `Map`. It has no expiry. It is never cleared by `vectorStoreLoader.js` when a new vector store file is loaded.
- **Expected behavior**: Either (a) add a cache-clear mechanism when the base vector store is reloaded, or (b) document clearly that a server restart is required after `rag:index`.
- **Files**:
  - `backend/src/rag/retriever.js` lines 24, 61–91
  - `backend/src/rag/vectorStoreLoader.js` lines 101–141 — vectorStoreCache also has no TTL
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### STB-007 — `@langchain/classic` is a deprecated compatibility shim — internal API access is fragile

- **What**: `retriever.js` and `vectorStoreLoader.js` directly access `vectorStore.memoryVectors` (an internal LangChain property). `@langchain/classic` is a shim for old LangChain v0.x APIs. Any minor update to this package can rename or remove `memoryVectors`, breaking retrieval silently.
- **Why it matters**: The retrieval pipeline depends on a private internal property of a deprecated package. This is a single-line breakpoint that could silently return 0 results if the package is updated.
- **Current behavior**: `retriever.js` line 81: `loadedStore.vectorStore.memoryVectors.filter(...)`. `vectorStoreLoader.js` line 123: `vectorStore.memoryVectors = payload.memoryVectors`. These access the `memoryVectors` private array directly.
- **Expected behavior**: Either pin `@langchain/classic` to an exact version and document why, or plan migration to `@langchain/community` MemoryVectorStore which is actively maintained.
- **Files**:
  - `backend/src/rag/retriever.js` line 81
  - `backend/src/rag/vectorStoreLoader.js` line 123
  - `backend/package.json` line 31 — `"@langchain/classic": "^1.0.32"` (caret allows minor version bumps)
- **Depends on**: none
- **Effort**: M
- **Status**: PENDING

---

### STB-008 — `learningMode` reset to `'idle'` on every global-mode request — DB state diverges from in-memory state

- **What**: In `step2.loadSession.js`, every global-mode request forces `chatState.learningMode = 'idle'` in memory. But `updateChatSessionState` in step7 only writes fields returned by the LLM's `memoryUpdate`. If the LLM does not explicitly return `learningMode` in a global turn, the DB retains the old mode while in-memory it is `'idle'`. The two views diverge.
- **Why it matters**: If a student was in `lesson` mode (Focus Mode) and sends a global question, the session DB still says `lesson` but the tutor context says `idle`. The next focus request reads `lesson` from DB, but step2 then sets `idle` again. This creates an inconsistent loop.
- **Current behavior**: `step2.loadSession.js` lines 75–78: `chatState.learningMode = 'idle'` for global mode, but this in-memory change is not written to the DB unless the LLM includes `learningMode` in its `memoryUpdate`.
- **Expected behavior**: When `studyMode === 'global'`, explicitly add `learningMode: 'idle'` to `stateUpdates` in step7 before calling `updateChatSessionState`, so the DB stays in sync.
- **Files**:
  - `backend/src/ask/step2.loadSession.js` lines 75–78
  - `backend/src/ask/step7.saveAndRespond.js` lines 106–116 — stateUpdates assembly
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

## 🟡 PRODUCT — Core product rule or student experience broken

---

### PRD-001 — No foundation/orientation content — broad Science questions answered from general LLM knowledge

- **What**: Questions like "Science kya hai?", "Physics kya hota hai?", "Mujhe padhna shuru karna hai" have no curated RAG content. The LLM answers from general knowledge, violating the core product rule.
- **Why it matters**: These are the FIRST questions new students ask. If Zuno's first answer is from general LLM knowledge (not from Bihar Board curated content), the product's core promise is broken from the very first interaction.
- **Current behavior**: The decider classifies "Science kya hai?" as `CONCEPT_QUESTION`, triggers retrieval, retrieval finds no good match (no orientation content exists in `data/`), the tutor gets `NO_RETRIEVED_CONTEXT` or very weak context, and either says "content not found" or answers from general knowledge depending on LLM behavior.
- **Expected behavior**: Add curated Markdown content for: "Science kya hai?", "Physics / Chemistry / Biology ka overview", "Bihar Board Class 10 syllabus overview", "padhai kaise karein" orientation content. Then re-run `npm run rag:index`.
- **Files**:
  - `data/class-10/science/` — missing orientation content
  - `backend/src/rag/indexPipeline.js` — re-run after adding content
- **Depends on**: none (content creation task, not code)
- **Effort**: M
- **Status**: PENDING

---

### PRD-002 — `abuseCount` tracked and persisted but never triggers any action

- **What**: `abuseCount` is in the Mongoose schema, in `ALLOWED_STATE_FIELDS`, and the LLM can increment it via `memoryUpdate`. But nowhere in the pipeline is it checked to warn, throttle, or block the student.
- **Why it matters**: Abusive students can keep sending inappropriate messages indefinitely. The `UNSAFE_OR_ABUSIVE` intent routing redirects them, but there is no escalation mechanism. `abuseCount` appears to be half-built.
- **Current behavior**: `chatSession.model.js` line 59 defines `abuseCount`. `step7.saveAndRespond.js` line 16 includes it in allowlist. But `step2.loadSession.js` lines 50–53 only checks `status === 'blocked'` — and nothing ever sets status to `blocked` based on `abuseCount`.
- **Expected behavior**: In step2, if `chatState.abuseCount >= N` (e.g., 3), either warn the student or set `status: 'blocked'`. Alternatively, document that this feature is intentionally deferred.
- **Files**:
  - `backend/src/ask/step2.loadSession.js` lines 50–53 — only checks status, not abuseCount
  - `backend/src/models/chatSession.model.js` line 59
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### PRD-003 — `sessionTopicsProgress` tracked but never read or acted upon

- **What**: `sessionTopicsProgress` (array of completed topic IDs) is in the schema and allowlist. The LLM can update it. But nothing in the pipeline reads or uses it for lesson progression, suggestions, or display.
- **Why it matters**: Lesson progress is a core feature for a tutor. The field exists and is wasted. Students get no sense of what they've covered.
- **Current behavior**: `chatSession.model.js` line 64 defines `sessionTopicsProgress: [String]`. It appears in `ALLOWED_STATE_FIELDS` (step7 line 17). But no code reads it to suggest next topics, compute progress, or display covered topics.
- **Expected behavior**: Either use this in NEXT_STEP intent routing to find the next uncovered topic, or remove it from the schema and allowlist until it is needed.
- **Files**:
  - `backend/src/models/chatSession.model.js` line 64
  - `backend/src/ask/step7.saveAndRespond.js` line 17
- **Depends on**: BUG-006 (NEXT_STEP logic)
- **Effort**: M
- **Status**: PENDING

---

### PRD-004 — FocusModal shows 5 hardcoded "Coming Soon" subjects — creates false expectations

- **What**: `FocusModal.jsx` hardcodes 6 subjects (Hindi, English, Math, Science, Social Science, Sanskrit). Only Science has content. The other 5 show as "Coming soon" prominently. Students click on them and get no response.
- **Why it matters**: Bihar Board Class 10 students study all these subjects. Seeing "Coming soon" repeatedly creates a poor first impression and implies a product roadmap not yet committed to.
- **Current behavior**: `FocusModal.jsx` lines 23–31: `baseSubjects` is a static array of 6 subjects. `enrichedSubjects` marks non-Science subjects as `available: false`. The cards render but are `disabled`.
- **Expected behavior**: Either remove non-Science subjects from the modal entirely until content exists, or add a brief modal message explaining the current scope without surfacing broken tiles.
- **Files**:
  - `frontend/src/components/FocusModal.jsx` lines 23–31
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### PRD-005 — `isFocusMiss` button in `ChatMessage` checks a status the backend never sends

- **What**: `ChatMessage.jsx` renders a "Search globally" button when `message.status === 'focus_context_not_found'`. The backend never produces this status. The button will never appear.
- **Why it matters**: The UX for "focus mode returned no results, search globally instead" is completely broken. Students have no escape hatch when focus mode fails to find content.
- **Current behavior**: `ChatMessage.jsx` line 39: `const isFocusMiss = message.status === 'focus_context_not_found'`. The backend (step6/step7) only emits: `answered`, `insufficient_context`, `needs_clarification`, `out_of_scope`. The status `focus_context_not_found` is never generated.
- **Expected behavior**: Either implement this status in the backend (check if focus mode returned empty chunks and emit `focus_context_not_found`), or remove the dead button from `ChatMessage.jsx`.
- **Files**:
  - `frontend/src/components/ChatMessage.jsx` lines 39, 70–80
  - `backend/src/ask/step6.generateResponse.js` lines 109–112 — valid status values list
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### PRD-006 — Full curriculum summary (all 16 chapters) is sent on every non-RAG request — wasted tokens

- **What**: `curriculumSummary` (all 16 chapters listed by subject/section) is included in every single tutor prompt call, including greetings, abuse redirects, and CHOOSE_COURSE responses where it is irrelevant.
- **Why it matters**: For Groq free tier, token usage directly determines rate limits. Each non-RAG turn wastes ~300–500 tokens on curriculum summary that the tutor does not need (e.g., for "Hello Zuno!"). This accelerates quota exhaustion.
- **Current behavior**: `step3.buildContext.js` line 89: `curriculumSummary = formatStudyMapSummary(studyMap)` — always built. `step6.generateResponse.js` line 88: `curriculumSummary` always passed to the LLM prompt.
- **Expected behavior**: Only include `curriculumSummary` when `responseMode === 'study_tutor'`. For `conversation` and `redirect` modes, pass a shorter placeholder or omit it.
- **Files**:
  - `backend/src/ask/step3.buildContext.js` line 89
  - `backend/src/ask/step6.generateResponse.js` lines 80–91
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

## 🔵 FEATURE — Not built yet, needed for complete product

---

### FET-001 — No deployment configuration — production launch is not possible

- **What**: There is no Dockerfile, no CI/CD pipeline, no production environment configuration, and no strategy for hosting `vector-store.json` (~70MB file) in a deployed environment.
- **Why it matters**: The project cannot be deployed to any hosting platform (Render, Railway, EC2, etc.) without resolving the vector store hosting and build steps. This blocks the entire production milestone.
- **Current behavior**: No `Dockerfile`, no `docker-compose.yml`, no `.github/workflows/`, no `render.yaml`, no `railway.json`. `vector-store.json` is in `backend/storage/` and is gitignored (or should be — it is 70MB+). No production env setup exists.
- **Expected behavior**: Add at minimum: a `Dockerfile` that runs `npm install` and starts `node src/server.js`; a strategy for the vector store file (either bundle in image or regenerate from content at container startup); environment variable documentation for the hosting platform.
- **Files**: No relevant files currently exist for this feature.
- **Depends on**: STB-004 (pre-warm vector store at startup)
- **Effort**: L
- **Status**: PENDING

---

### FET-002 — No regression test suite for the Ask pipeline — old tests deleted in TASK-023

- **What**: The old `test:lesson-flow` and `test:tutor-conversations` scripts were deleted in TASK-023. The current `test:ask-db` is a shallow persistence check, not a real integration test. No mocked LLM tests exist.
- **Why it matters**: Any future change to the pipeline (prompt edits, step logic changes, schema changes) has no automated safety net. Breaking changes go undetected.
- **Current behavior**: `backend/package.json` scripts: no `test:pipeline`, no `test:ask-unit`. `test:ask-db` exists but only tests that DB writes succeed — it does not validate LLM decisions or response quality.
- **Expected behavior**: Add at minimum: (a) unit tests for `normalizeDecision`, `sanitizeMemoryUpdate`, `formatMemoryForPrompt` with mock inputs; (b) one integration test per intent type (mocked LLM) asserting the correct `retrievedContext` and `status` in the response.
- **Files**: Missing — needs to be created in `backend/scripts/` or a new `backend/tests/` directory
- **Depends on**: none
- **Effort**: L
- **Status**: PENDING

---

### FET-003 — No streaming — students wait 10–90 seconds with a spinning dot indicator

- **What**: The frontend waits for the complete response from the backend before rendering anything. With 2 LLM calls in series, response times of 10–90 seconds are normal. No partial rendering or streaming exists.
- **Why it matters**: A 30-second blank spinner with no feedback is the single largest UX issue for students. LLM streaming (tokens arriving as they are generated) would make the experience feel near-instant.
- **Current behavior**: `tutorApi.js` uses a standard `fetch()` with `await response.json()`. The backend returns a complete JSON payload. No streaming or SSE (Server-Sent Events) is used.
- **Expected behavior**: Implement SSE or WebSocket streaming for the tutor response section. At minimum, stream the `answer` text token-by-token using LangChain's streaming API and `streamText`.
- **Files**:
  - `frontend/src/api/tutorApi.js` lines 25–46
  - `backend/src/ask/step6.generateResponse.js` — would need streaming chain
  - `backend/src/controllers/ask.controller.js` — would need `res.write()` for SSE
- **Depends on**: none (can be implemented independently)
- **Effort**: L
- **Status**: PENDING

---

### FET-004 — No request timeout middleware on the backend

- **What**: Express has no timeout middleware. A stalled LLM call (e.g., Groq queuing a request for minutes) holds the Express connection open indefinitely.
- **Why it matters**: Under load, stalled connections accumulate and exhaust Node.js's connection pool. Students using the app during a Groq outage or slowdown get no response and no error.
- **Current behavior**: `app.js` lines 1–34 — no `connect-timeout` or custom timeout middleware. No `setTimeout` on `fetch` or LangChain calls on the backend.
- **Expected behavior**: Add a 45-second request timeout using `connect-timeout` or a custom middleware. On timeout, return a student-friendly 503: "Zuno abhi busy hai, thodi der mein try karo."
- **Files**:
  - `backend/src/app.js`
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### FET-005 — No embedding cache — identical student questions re-embed on every request

- **What**: Every retrieval request embeds the search query fresh via `createQueryEmbeddings()`. Identical or near-identical questions from different sessions re-call the Gemini embedding API each time.
- **Why it matters**: Gemini embedding calls add ~200–500ms latency and count toward API quota. In a classroom scenario where many students ask the same questions, this is wasteful and slow.
- **Current behavior**: `retriever.js` line 112: `const embeddings = options.embeddings || createQueryEmbeddings()` — fresh embeddings per call. No cache exists for query embeddings.
- **Expected behavior**: Add a simple in-memory LRU cache (100–500 entries) keyed on the normalized query string. Most Class 10 students ask similar questions; the hit rate would be high.
- **Files**:
  - `backend/src/rag/retriever.js` line 112
- **Depends on**: none
- **Effort**: M
- **Status**: PENDING

---

### FET-006 — Chat history UI not implemented — sidebar History shows "Coming soon"

- **What**: The sidebar in the frontend shows History, Tracking, and Quiz items as "Coming soon" (non-functional). Students cannot browse their previous conversations.
- **Why it matters**: A student who closed the tab and returned cannot pick up where they left off unless they remember their last question. The DB already stores full history via `chat_history` collection — it just isn't surfaced.
- **Current behavior**: `Sidebar.jsx` lines 13–17: `navItems` array hardcodes `status: 'Soon'` for History, Tracking, Quiz. `ChatHistory` model and `getChatHistory` service exist but are never called from any API route.
- **Expected behavior**: Add `GET /api/v1/sessions/:sessionId/history` endpoint. Connect it to `getChatHistory`. Display messages in a collapsible sidebar or session page.
- **Files**:
  - `frontend/src/components/Sidebar.jsx` lines 13–17
  - `backend/src/services/chatHistory.service.js` — `getChatHistory` exists, needs route
- **Depends on**: none
- **Effort**: M
- **Status**: PENDING

---

## 🔐 SECURITY — Must fix before any real users touch this system

---

### SEC-001 — Raw LLM provider error messages sent directly to clients

- **What**: `error.middleware.js` returns `error.message` verbatim. Provider errors (Groq 429, auth failures) contain internal details: model names, organization IDs, API key hints, rate limit quotas.
- **Why it matters**: This leaks infrastructure details to any user who triggers an error — which happens on every rate-limit. A malicious user can map the backend's provider, model, and org details from a single rate-limit trigger.
- **Current behavior**: `error.middleware.js` lines 7–13: `message: error.message`. No filtering of sensitive error content. Example Groq error: "Error 429: Rate limit exceeded for model llama-3.3-70b-versatile in organization org-XYZ on tokens per minute. Limit 6000, used 5900..."
- **Expected behavior**: In production (`NODE_ENV === 'production'`), map known provider error types to generic student-friendly messages. For unknown errors, return a generic "Something went wrong, please try again." Log the full error server-side only.
- **Files**:
  - `backend/src/middlewares/error.middleware.js` lines 1–14
- **Depends on**: none
- **Effort**: S
- **Status**: FIXED
- **Resolution**: error.middleware.js updated — raw error.message no longer sent to clients for 5xx errors. Safe Hinglish message returned instead. Real error logged server-side.
- **Closed**: 2026-06-06

---

### SEC-002 — CORS is completely open — any website can call this API

- **What**: `app.js` uses `app.use(cors())` with no configuration. Any domain can send requests to this API, including malicious websites that embed Zuno in an iframe and use the API on behalf of victims.
- **Why it matters**: Without origin restriction, cross-site request attacks are trivial. Once auth is added, open CORS becomes a session-hijacking vector.
- **Current behavior**: `app.js` line 14: `app.use(cors())` — defaults to allowing all origins, all methods, all headers.
- **Expected behavior**: Restrict CORS to the known frontend origin(s). In development: `http://localhost:5173`. In production: the actual deployed frontend URL. Use an env var `CORS_ALLOWED_ORIGIN`.
- **Files**:
  - `backend/src/app.js` line 14
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### SEC-003 — `sessionId` is not validated as a UUID — any string opens or creates a session

- **What**: `requestedSessionId` from the request body is `cleanText(body.sessionId)` — only whitespace-stripped. Any string (including empty string, SQL-like strings, or sequential IDs) is accepted as a valid session key. Users can guess or enumerate other users' sessions.
- **Why it matters**: Session documents in MongoDB are looked up purely by the `sessionId` string with no ownership check. A student who knows (or guesses) another student's sessionId can read their full conversation history. As more users join, sequential or short IDs are guessable.
- **Current behavior**: `step1.validateInput.js` line 25: `const requestedSessionId = cleanText(body.sessionId)`. No UUID format validation. `step2.loadSession.js` line 16: `const sessionId = requestedSessionId || randomUUID()` — accepts any string.
- **Expected behavior**: Validate that `requestedSessionId`, if provided, matches the UUID v4 format regex. Reject non-UUID strings with a 400 error.
- **Files**:
  - `backend/src/ask/step1.validateInput.js` line 25
  - `backend/src/ask/step2.loadSession.js` line 16
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### SEC-004 — No HTTP security headers (no Helmet.js)

- **What**: The backend sends no security-related HTTP headers: no `X-Content-Type-Options`, no `X-Frame-Options`, no `Content-Security-Policy`, no `Strict-Transport-Security`.
- **Why it matters**: Without security headers, the API and any served content is vulnerable to MIME sniffing, clickjacking, and cross-site scripting via response embedding. These are baseline production requirements.
- **Current behavior**: `app.js` lines 13–16: only `cors`, `express.json`, `morgan` middleware. No `helmet`.
- **Expected behavior**: Add `helmet` package and `app.use(helmet())` before other middleware. This sets 15+ security headers automatically.
- **Files**:
  - `backend/src/app.js` lines 1–16
  - `backend/package.json` — `helmet` package not listed
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### SEC-005 — `morgan('dev')` used in all environments — verbose request logs in production

- **What**: `morgan('dev')` is hardcoded in `app.js`. The `dev` format logs method, path, status code, response time, and response size for every request. In production, this fills logs with noise and can reveal request patterns to anyone with log access.
- **Why it matters**: In production, `morgan('combined')` is standard — it logs less per-request and uses the standard Apache log format. The `dev` format is intended for development terminals only.
- **Current behavior**: `app.js` line 16: `app.use(morgan('dev'))` — always `dev` format regardless of `NODE_ENV`.
- **Expected behavior**: `app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))`.
- **Files**:
  - `backend/src/app.js` line 16
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

## ⚪ TECH DEBT — Cleanup that improves maintainability

---

### TDT-001 — AI-generated comment bloat throughout step files reduces readability

- **What**: Step 2, 3, 4, 5, and 6 files contain a high density of AI-generated marketing comments that describe obvious code behavior: "PRODUCTION-GRADE ORCHESTRATOR COMPONENT", "Concurrent-safe curriculum initialization zone", "Resolves reference loops by reviewing historical semantic hydration hooks", "Cryptic database IDs", "Backward compatible message window layer array parsing", "Dispatching context metrics into Intent Mapping layer".
- **Why it matters**: These comments reduce readability, obscure actual intent, and make the codebase look unprofessional. A developer joining the project 6 months later spends 30% of their reading time on meaningless filler.
- **Current behavior**: See `step2.loadSession.js` lines 4, 19, 25, 31; `step3.buildContext.js` line 74; `step4.decideRetrieval.js` lines 21, 35, 42, 44, 76; `step5.retrieveContent.js` line 4.
- **Expected behavior**: Replace filler comments with 1-line statements of *why* (not what) — e.g., `// Parallel DB fetch reduces latency` instead of `// Parallel lookup directly hitting primary key indexe`.
- **Files**:
  - `backend/src/ask/step2.loadSession.js`
  - `backend/src/ask/step3.buildContext.js`
  - `backend/src/ask/step4.decideRetrieval.js`
  - `backend/src/ask/step5.retrieveContent.js`
- **Depends on**: none
- **Effort**: M
- **Status**: PENDING

---

### TDT-002 — Two separate `loadLangChainMemoryVectorStore` implementations with different validation

- **What**: `vectorStorePersistence.js` and `vectorStoreLoader.js` both export a function named `loadLangChainMemoryVectorStore`. They have different validation logic: `vectorStoreLoader.js` checks embedding dimensions and metadata; `vectorStorePersistence.js` does not check dimensions. If they diverge further, indexing and retrieval could mismatch silently.
- **Why it matters**: Two implementations of the same function is a maintenance hazard. Any bug fix applied to one must be manually duplicated to the other. The loader version is the authoritative one used at runtime; the persistence version is now only used in tests.
- **Current behavior**: `vectorStoreLoader.js` lines 33–71 — full validation with dimension check. `vectorStorePersistence.js` lines 23–42 — lighter validation, no dimension check. Both are exported with the same name.
- **Expected behavior**: Remove `loadLangChainMemoryVectorStore` from `vectorStorePersistence.js`. Any code that uses it should import from `vectorStoreLoader.js` instead.
- **Files**:
  - `backend/src/rag/vectorStorePersistence.js` lines 78–110 — duplicate to remove
  - `backend/src/rag/vectorStoreLoader.js` — authoritative version to keep
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### TDT-003 — `findChapterById` duplicates the `selectedChapter` `useMemo` in `App.jsx`

- **What**: `App.jsx` has two nearly identical nested-loop traversals of the study map: `selectedChapter` (useMemo, lines 86–106) and `findChapterById` (function, lines 108–128). Both iterate all subjects → sections → chapters to find a chapter by ID.
- **Why it matters**: If the studyMap structure changes, both functions must be updated. They can silently diverge. This is a classic duplication hazard.
- **Current behavior**: Lines 86–128 in `App.jsx` contain functionally identical code. `findChapterById` is only called from `handleFocusChapterSelect` (line 131). `selectedChapter` is derived from `selectedChapterId`.
- **Expected behavior**: Consolidate into one utility function in `frontend/src/utils/studyMap.js` (which already has `findFirstChapter`). Call it in both places.
- **Files**:
  - `frontend/src/App.jsx` lines 86–128
  - `frontend/src/utils/studyMap.js` — extend with `findChapterById` utility
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### TDT-004 — `createChatSession` and `getOrCreateChatSession` in `chatSession.service.js` are dead code

- **What**: The runtime ask pipeline never calls `createChatSession` or `getOrCreateChatSession`. The pipeline uses `updateChatSessionState` with `upsert: true` for both create and update. These two exported functions are unused in production code paths.
- **Why it matters**: Dead exports confuse future developers about which functions are actually used in the pipeline. They also import `randomUUID` which may not be needed if only `updateChatSessionState` is used.
- **Current behavior**: `chatSession.service.js` lines 4–18 (`createChatSession`) and lines 24–39 (`getOrCreateChatSession`) — exported but not imported anywhere in the `ask/` directory or any controller. Possibly used in test scripts only.
- **Expected behavior**: If these are only used in test scripts, add a JSDoc comment: `// Used only in test scripts — not part of the runtime pipeline`. If unused everywhere, remove them.
- **Files**:
  - `backend/src/services/chatSession.service.js` lines 4–39
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### TDT-005 — `memory` double-stringification guard in `step6.generateResponse.js` is dead code

- **What**: `step6` checks `typeof memory === 'object'` and re-stringifies it. But `memory` comes from step3 already as a string (`JSON.stringify(formatMemoryForPrompt(chatState))`). The type check is always `false`; the guard is never taken.
- **Why it matters**: Misleading dead code. A developer reading step6 will wonder why memory is re-stringified, then read step3, then realize it's already a string. Time wasted.
- **Current behavior**: `step6.generateResponse.js` lines 76–79:
  ```js
  const serializedMemory = memory && typeof memory === 'object'
      ? JSON.stringify(memory, null, 2)
      : String(memory || 'No active state records.');
  ```
  `memory` (from step3 line 86) is always `typeof === 'string'`. The ternary always takes the `else` branch.
- **Expected behavior**: Replace with `const serializedMemory = memory || 'No active state records.';`
- **Files**:
  - `backend/src/ask/step6.generateResponse.js` lines 76–79
  - `backend/src/ask/step3.buildContext.js` line 86 — confirms memory is already a string
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### TDT-006 — `/health` route is inconsistent with all other API routes

- **What**: The health endpoint is at `/health` but all other routes are under `/api/v1/`. This inconsistency means load balancers, health check configs, and monitoring tools must be configured with a different prefix.
- **Why it matters**: When deploying, most health check tools expect the path to follow the same prefix convention. This is a minor but irritating inconsistency that will bite during deployment setup.
- **Current behavior**: `app.js` line 24: `app.use('/health', healthRoutes)`. All others: `app.use('/api/v1/...', ...)`.
- **Expected behavior**: Move health route to `/api/v1/health`. Update any existing health check configs.
- **Files**:
  - `backend/src/app.js` line 24
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### TDT-007 — Tutor message metadata stores full `sections` array in MongoDB history — unbounded document growth

- **What**: `step7.saveAndRespond.js` saves each tutor message with `metadata: { sections: answerPayload.sections }`. Each tutor message's sections array contains multiple headings and paragraphs. Over 30 messages (the history cap), the `chat_history` document grows very large.
- **Why it matters**: MongoDB documents have a 16MB limit. A chatHistory document with 30 messages each containing 3–5 sections of text will approach this limit for heavily used sessions. Also, `getRecentChatHistory` fetches the last 14 messages including their full sections metadata — this is expensive to deserialize.
- **Current behavior**: `step7.saveAndRespond.js` lines 148–159: tutor messages saved with `metadata: { sections: answerPayload.sections }`. Each section has `heading` + `content` strings.
- **Expected behavior**: Remove `sections` from message metadata. The structured sections are used only for rendering; the flat `text` field (which is the plain-text version of sections) is sufficient for context and history.
- **Files**:
  - `backend/src/ask/step7.saveAndRespond.js` lines 148–159
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

### TDT-008 — `SourceChips.jsx` component exists but is imported nowhere in the frontend

- **What**: `frontend/src/components/SourceChips.jsx` is a complete, working React component but is never imported or used anywhere. It ends up in the production bundle without ever rendering.
- **Why it matters**: This is currently connected to BUG-003 (sources not rendered). Once BUG-003 is fixed, this becomes moot. But until then, it is dead bundle weight and confusing for developers who see the component but cannot find where it is used.
- **Current behavior**: `SourceChips.jsx` exists. `ChatMessage.jsx` does not import it. Grepping the entire `frontend/src/` folder finds no import of `SourceChips`.
- **Expected behavior**: Fix BUG-003 first (import and use SourceChips in ChatMessage.jsx). This item closes automatically when BUG-003 is resolved.
- **Files**:
  - `frontend/src/components/SourceChips.jsx`
  - `frontend/src/components/ChatMessage.jsx` — needs the import
- **Depends on**: BUG-003
- **Effort**: S
- **Status**: CLOSED
- **Resolution**: Closed with BUG-003. SourceChips.jsx deleted — dead code removed.
- **Closed**: 2026-06-04

---

### TDT-009 — `PORT=5000` is duplicated in `backend/.env` (noted in ANALYSIS.md, confirmed)

- **What**: `backend/.env` defines `PORT=5000` twice. The second definition takes effect. This causes silent confusion when debugging port-binding issues.
- **Why it matters**: Minor. Developer edits the first PORT line, the second overrides it silently.
- **Current behavior**: `backend/.env` has two `PORT=5000` lines (confirmed in ANALYSIS.md, file is gitignored so not directly readable).
- **Expected behavior**: Remove one of the duplicate PORT definitions.
- **Files**:
  - `backend/.env` — gitignored, must be fixed locally
- **Depends on**: none
- **Effort**: S
- **Status**: FIXED
- **Resolution**: `backend/.env` se line 1 ka `PORT=5000` hataya — sirf `PORT=5001` remain kiya. Fixed as part of STB-001.
- **Closed**: 2026-06-07

---

### TDT-010 — `cosine distance vs similarity` conversion in `retriever.js` needs explicit documentation and a test

- **What**: `retriever.js` line 127 says "LangChain returns Cosine Distance. We map it cleanly to Cosine Similarity: 1 - Distance." `@langchain/classic` MemoryVectorStore's `similaritySearchWithScore` return value semantics are not officially documented. If a package update changes this behavior (returning similarity instead of distance), the conversion would invert all scores and break retrieval silently.
- **Why it matters**: If the inversion is wrong, good matches get LOW scores and are filtered out. The system would return empty RAG results for most queries, and the LLM would answer from general knowledge. This is the highest-impact silent failure possible.
- **Current behavior**: `retriever.js` lines 129–131: `const similarityScore = 1 - distanceScore`. No test verifies that this conversion produces expected values for known query-chunk pairs.
- **Expected behavior**: Add a test (`scripts/test-score-semantics.js`) that: (1) embeds a known query, (2) runs similaritySearchWithScore against a known matching chunk, (3) asserts the raw returned score is < 0.5 (if it's distance) or > 0.5 (if it's similarity), so the conversion can be verified. Add a comment with the LangChain version and verified return-value semantics.
- **Files**:
  - `backend/src/rag/retriever.js` lines 127–131
  - `backend/package.json` line 31 — `@langchain/classic` version
- **Depends on**: none
- **Effort**: S
- **Status**: PENDING

---

## Summary

### Total items by category

| Category | Count |
|---|---|
| 🔴 CRITICAL (BUG) | 7 |
| 🟠 STABILITY (STB) | 8 |
| 🟡 PRODUCT (PRD) | 6 |
| 🔵 FEATURE (FET) | 6 |
| 🔐 SECURITY (SEC) | 5 |
| ⚪ TECH DEBT (TDT) | 10 |
| **TOTAL** | **42** |

---

### Critical items that block a real demo

These make the product visibly wrong or broken during a live demo:

| ID | Issue | Demo Impact |
|---|---|---|
| BUG-001 | lastTopic always null | Follow-up questions lose all context |
| BUG-002 | No try/catch in step4 | Raw Groq error text shown to students |
| BUG-003 | SourceChips never rendered | "Sources" feature completely invisible |
| BUG-004 | EXPLAIN_MORE → "content not found" | Most natural learning request fails |
| BUG-005 | English input → English output | Violates core Hinglish-always rule |
| STB-001 | No fetch timeout | UI freezes on slow LLM |
| PRD-004 | 5 "Coming soon" subjects in FocusModal | Looks unfinished |

---

### Items that must be done before any real user touches this system

These are not demo issues — they are correctness, safety, and security issues:

| ID | Issue | Risk |
|---|---|---|
| SEC-001 | Raw error messages to clients | Leaks Groq key info, model names, org IDs |
| SEC-002 | Open CORS | Any website can call this API |
| SEC-003 | sessionId not validated | Users can read other users' history |
| SEC-004 | No Helmet.js | Missing basic HTTP security headers |
| STB-003 | No rate limiting | Quota exhausted in minutes under load |
| BUG-002 | Provider errors → students | Crash messages instead of friendly fallback |
| STB-005 | No env validation at startup | Server starts silently broken, crashes on first request |

---

### Recommended first 3 items to tackle and why

**1. BUG-003 — Render SourceChips in ChatMessage.jsx** (S effort, zero risk)  
This is a 5-line change that unlocks a fully built feature. Source attribution is the single most important differentiator of this product. The backend already does all the work; the frontend just needs to render it. Fix this first — it is the highest-value change per line of code.

**2. BUG-001 — Add `lastTopic` + doubt fields to schema and allowlist** (S effort, breaks nothing)  
This is the root cause of broken conversational continuity. Without it, BUG-004 (EXPLAIN_MORE) and BUG-006 (NEXT_STEP) cannot be fixed either. It requires: (a) add 3 fields to `chatSession.model.js` schema, (b) add them to `ALLOWED_STATE_FIELDS` in step7. The schema change uses `strict: true` defaults so it is safe.

**3. BUG-002 — Add try/catch to step4.decideRetrieval.js** (S effort, critical for demo)  
A Groq rate-limit error is the most common failure during any live demo (free tier, 30 req/min). Without a catch block, the student sees a raw error string with Groq internal details. With a catch block and fallback decision object, the pipeline continues to step6 which already has its own fallback. This prevents the most common visible crash.
