# Bihar Board AI Tutor — CLAUDE.md

## Project Name and Purpose

**Zuno** — an AI-powered personal tutor for Bihar Board Class 10 Science students. Students ask questions in Hindi, Hinglish, or simple English and receive simple Hinglish answers grounded only in curated approved study content. The core rule: Zuno must never answer from general LLM knowledge when retrieved source content is insufficient — it must clearly say so.

## Target User

Bihar Board Class 10 students studying Science (Physics, Chemistry, Biology). They may write in Hindi (Devanagari), Hinglish (Roman-script Hindi), or simple English. Answers must always be in simple Roman-script Hinglish.

---

## Full Tech Stack

### Backend
- **Runtime**: Node.js (ESM, `"type": "module"`)
- **Framework**: Express.js
- **LLM Provider**: Groq (default, `llama-3.3-70b-versatile`) — switchable to OpenAI or Google Gemini via `LLM_PROVIDER` env var
- **Embeddings**: Google Gemini `gemini-embedding-001` via LangChain `GoogleGenerativeAIEmbeddings` (3072-dimensional)
- **Vector Store**: LangChain `MemoryVectorStore` (from `@langchain/classic`) persisted to JSON file
- **RAG Framework**: LangChain (`@langchain/core`, `@langchain/classic`, `@langchain/google-genai`, `@langchain/groq`, `@langchain/openai`, `@langchain/textsplitters`)
- **Database**: MongoDB Atlas via Mongoose (`^9.6.2`)
- **Markdown parsing**: `gray-matter` (frontmatter), custom heading-based chunker
- **Env config**: `dotenv`
- **HTTP logging**: `morgan`
- **Dev server**: `nodemon`

### Frontend
- **Framework**: React 19 + Vite 6
- **UI Library**: Material UI v9 (`@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`)
- **State**: React `useState`/`useEffect`/`useRef`/`useMemo` (no external state manager)
- **API**: native `fetch()`
- **Session persistence**: `localStorage`

---

## Folder Structure Overview

```
bihar-board-ai-tutor/
├── AGENTS.md                        AI agent rules for this project
├── CLAUDE.md                        This file
├── ANALYSIS.md                      Full codebase analysis (generated 2026-06-03)
├── DECISIONS.md                     Architecture decisions log
├── TASKS.md                         Task history and current status
├── README.md                        Project overview and RAG commands
├── tasks/                           Individual task spec files (TASK-001 through TASK-023)
├── docs/                            Architecture notes, QA reports, API explanations
│   ├── qa-report-2026-05-21.md      Latest QA findings (read this before fixing bugs)
│   ├── polish-notes.md              UX/tone issues from real chat testing
│   ├── rag-embeddings-vector-store.md
│   ├── tutor-engine-langchain-architecture.md
│   └── api-explanations/
├── data/
│   └── class-10/science/            16 curated Markdown chapters (RAG source content)
│       ├── biology/                 4 chapters
│       ├── chemistry/               5 chapters
│       └── physics/                 7 chapters
├── backend/
│   ├── src/
│   │   ├── server.js                Entry point — starts Express + MongoDB
│   │   ├── app.js                   Express app — routes, CORS, error handler
│   │   ├── ask/                     7-step Ask API pipeline (main product logic)
│   │   │   ├── askOrchestrator.js   READ THIS FIRST to understand the flow
│   │   │   ├── step1.validateInput.js
│   │   │   ├── step2.loadSession.js
│   │   │   ├── step3.buildContext.js
│   │   │   ├── step4.decideRetrieval.js   LLM call #1 (intent classifier)
│   │   │   ├── step5.retrieveContent.js   RAG retrieval (conditional)
│   │   │   ├── step6.generateResponse.js  LLM call #2 (tutor answer)
│   │   │   ├── step7.saveAndRespond.js    DB save + API response
│   │   │   └── promptHelpers.js
│   │   ├── prompts/                 LangChain ChatPromptTemplate definitions
│   │   │   ├── deciderPrompt.js
│   │   │   └── tutorPrompt.js
│   │   ├── rag/                     RAG indexing and retrieval
│   │   │   ├── indexPipeline.js     Offline: load → chunk → embed → save (npm run rag:index)
│   │   │   ├── markdownLoader.js
│   │   │   ├── markdownChunker.js
│   │   │   ├── geminiEmbeddings.js
│   │   │   ├── vectorStoreLoader.js   Runtime: loads + caches vector store
│   │   │   ├── vectorStorePersistence.js  Indexing: saves vector store
│   │   │   ├── retriever.js           Main retrieval function (used by step5)
│   │   │   ├── retriever.config.js
│   │   │   ├── reranker.js            Keyword + intent reranker
│   │   │   └── sourceFormatter.js
│   │   ├── llm/                     LLM provider factory
│   │   ├── models/                  Mongoose schemas (chatSession, chatHistory)
│   │   ├── services/                DB service helpers
│   │   ├── curriculum/              Chapter/topic index and resolvers
│   │   ├── controllers/             Express controllers (ask, health, studyMap)
│   │   ├── routes/                  Express route definitions
│   │   ├── config/env.js            Loads .env and exports typed config
│   │   ├── db/mongooseClient.js     MongoDB connect/disconnect
│   │   ├── middlewares/
│   │   ├── utils/
│   │   └── inspectors/              Local inspection scripts (not production)
│   ├── scripts/                     Test and utility scripts (run via npm run ...)
│   ├── storage/
│   │   ├── vector-store.json        Pre-built vector store (600 vectors, 3072-dim)
│   │   └── curriculum-index.json   Chapter/topic index
│   ├── docs/curriculum-brain-foundation.md
│   ├── .env                         Local secrets (gitignored — never commit)
│   └── .env.example                 Template for required env keys
└── frontend/
    ├── src/
    │   ├── App.jsx                  Main component — all state lives here
    │   ├── api/tutorApi.js          fetch wrappers for backend
    │   ├── components/              AppHeader, AskBar, ChatMessage, FocusModal,
    │   │                            Sidebar, SourceChips, StatusNotice
    │   ├── constants/studyModes.js
    │   ├── utils/session.js         localStorage sessionId helpers
    │   ├── utils/studyMap.js        findFirstChapter helper
    │   ├── theme/zunoTheme.js       MUI dark theme
    │   └── styles/global.css
    ├── .env.example                 VITE_API_BASE_URL
    └── dist/                        Production build output (gitignored)
```

---

## Required Environment Variables

### backend/.env
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...   (or MONGO_URI — both are checked)
GEMINI_API_KEY=...              (for embeddings — always required for indexing/retrieval)
LLM_PROVIDER=groq               (groq | openai | google)
LLM_MODEL=llama-3.3-70b-versatile
LLM_TEMPERATURE=0
GROQ_API_KEY=...                (if LLM_PROVIDER=groq)
OPENAI_API_KEY=...              (if LLM_PROVIDER=openai)
GOOGLE_API_KEY=...              (if LLM_PROVIDER=google)
```

### frontend/.env
```
VITE_API_BASE_URL=http://localhost:5000
```

---

## Current Project Status

### Done (all backend pipeline stages complete)
- 16 curated Science Markdown chapters as RAG content
- Markdown loader, chunker (600 chunks), Gemini embeddings (3072-dim)
- LangChain MemoryVectorStore with JSON persistence
- Custom keyword + intent reranker
- 7-step LLM-first Ask API pipeline
- MongoDB Atlas session, history, and state persistence
- Study Map API
- React frontend with dark MUI theme, FocusModal, session handling

### Known Bugs to Fix Before Next Demo
1. `lastTopic` and doubt-context fields silently dropped — add them to `ALLOWED_STATE_FIELDS` in `step7.saveAndRespond.js` AND to the Mongoose schema in `chatSession.model.js`
2. No LLM error handling in `step4.decideRetrieval.js` — wrap with try/catch and safe fallback
3. Frontend fetch has no timeout — add `AbortController` with ~30s timeout in `tutorApi.js`
4. `npm run rag:query` broken — `package.json` points to non-existent file

### Pending Work (in priority order)
1. Add curated foundation/orientation Markdown content (Science kya hai?, study skills, etc.) and rebuild vector store
2. Add graceful LLM provider error handling with student-friendly fallback messages
3. Add frontend request timeout
4. Add retrieval sufficiency guard for weak context
5. Add LLM-first regression tests (mocked decider/responder)
6. Fix `lastTopic` persistence bug (schema + allowlist)
7. Frontend: lesson state display, continue-lesson action
8. Production deployment (Stage 12 — not started)

---

## Key Rules for All Future Work

### Before coding
- Read `TASKS.md` and `docs/qa-report-2026-05-21.md` before starting any new task
- Read `ANALYSIS.md` for current bug list and open questions
- Always ask before big architectural changes
- Analysis before code

### Core product rule
Zuno must answer ONLY from retrieved/indexed source content. If retrieved context is insufficient, return `status: insufficient_context` and tell the student clearly. Never answer from general LLM knowledge.

### RAG pipeline rules
- Keep the RAG pipeline modular — indexing and retrieval are separate concerns
- Run `npm run rag:index` from `backend/` after any content changes in `data/`
- Do not hardcode chapter names in routing logic — read from StudyMap API
- Do not move RAG vectors into MongoDB — keep JSON persistence for MVP

### Language rules
- All student-facing answers must be in simple Roman-script Hinglish
- No Devanagari in answers unless the `answerLanguageInstruction` explicitly requests it
- Keep analogies local (Bihar/UP context) and use them sparingly

### Code rules
- Work on one task at a time
- Do not overbuild — no admin panel, analytics, quiz, auth, PDF pipeline unless explicitly asked
- Keep `backend/` and `data/` concerns separate
- No new npm packages without a clear reason
- Do not commit `.env` under any circumstances

### Testing
- After any backend change, run: `npm run test:chunks`, `npm run test:study-map`, `npm run test:curriculum-resolvers`, `npm run test:vector-store`, `npm run test:chat-db-models`
- After any frontend change, run: `npm run build` from `frontend/`
- Full network-backed tests (`test:retrieval`, `test:ask-db`) require Gemini and MongoDB access

---

## RAG Commands (run from `backend/`)

```bash
npm run rag:index          # Build/rebuild vector store from data/ content
npm run test:chunks        # Validate chunker output (600 chunks expected)
npm run test:study-map     # Validate study map API
npm run test:vector-store  # Validate vector store file (600 vectors, 3072-dim)
npm run test:retrieval     # Live retrieval smoke test (needs Gemini key + network)
npm run test:ask-db        # Live ask + DB integration test (needs all keys + network)
npm run db:ping            # Test MongoDB Atlas connection
```

## API Endpoints

```
POST /api/v1/ask         — main tutor endpoint
GET  /api/v1/study-map   — returns available chapters (for FocusModal)
GET  /health             — health check (note: NOT /api/v1/health — inconsistency)
```
