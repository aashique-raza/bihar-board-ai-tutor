# TASKS.md

## Project

Bihar Board Class 10 Science AI Tutor

## Current Direction

The project uses curated English Markdown files as the primary knowledge source for RAG.

Hindi PDFs are reference material only.

The app should not depend on raw PDF parsing quality for production RAG content.

## Current Active Task

No active implementation task.

Next recommended task:
Source Dedupe and Compact Backend Source Contract

Known performance backlog:
TASK-020: Performance Known Issues Backlog

## Completed Tasks

### TASK-001: Minimal Backend Foundation

Status: DONE

Task file:
tasks/TASK-001-minimal-backend-foundation.md

Completed:
- Created minimal backend folder structure.
- Added health route.
- Added basic Express app/server setup.
- Added config, middleware, utils, and route structure.
- Backend runs successfully.

### TASK-002: Curated Content Foundation

Status: DONE

Task file:
tasks/TASK-002-curated-content-foundation.md

Completed:
- Confirmed curated Markdown content path.
- Established curated English Markdown as the primary RAG source.
- Kept Hindi PDFs as reference material only.
- Confirmed no embeddings, chunking, vector DB, or RAG were added.

### TASK-003: Curated Content Loader

Status: DONE

Task file:
tasks/TASK-003-curated-content-loader.md

Completed:
- Created curated Markdown loader.
- Loaded Markdown files recursively.
- Parsed frontmatter metadata.
- Added preview command for loaded curated content.

### TASK-004: Chunking Strategy

Status: DONE

Task file:
tasks/TASK-004-chunking-strategy.md

Completed:
- Split curated Markdown into RAG-friendly chunks.
- Preserved chapter, section, heading, and source metadata.
- Verified chunker behavior with 27/27 tests passing.
- Generated 600 valid chunks from 16 Science documents.

### TASK-006: LangChain Embeddings and Vector Store Fix

Status: DONE

Task file:
tasks/TASK-006-langchain-embeddings-vector-store-fix.md

Completed:
- Rejected the earlier manual embedding/search approach.
- Moved active embedding and retrieval implementation to LangChain primitives.
- Used LangChain `GoogleGenerativeAIEmbeddings`, `Document`, and `MemoryVectorStore`.

### TASK-007: LangChain Embedding Retrieval Tests

Status: DONE

Task file:
tasks/TASK-007-langchain-embedding-retrieval-tests.md

Completed:
- Added embedding smoke, vector-store validation, and retrieval smoke scripts.
- Verified imports, environment setup, and active pipeline wiring.

### TASK-008: LangChain Embeddings, Vector Store, and Retrieval

Status: DONE

Task file:
tasks/TASK-008-langchain-embeddings-vector-store-retrieval.md

Completed:
- Indexed 16 documents.
- Generated 600 chunks.
- Saved 600 vectors to `backend/storage/vector-store.json`.
- Verified vector store validation with embedding dimension 3072.
- Verified retrieval for Hindi, Hinglish, and English queries.

### TASK-009: RAG Query Layer and Grounded Answer Generation

Status: DONE

Task file:
tasks/TASK-009-rag-query-answer-generation.md

Completed:
- Added query-side RAG structure for retriever, reranker, prompt, chain, parser, LLM config, and answer service.
- Added lightweight reranking and final filtering after vector search.
- Added grounded prompt builder through LangChain `ChatPromptTemplate`.
- Added provider-based LLM answer generation through LangChain LCEL.
- Added simple Hinglish answer generation with sources.
- Added insufficient-context fallback.
- Added Ask API with Global Mode and Focus Mode.
- Added Study Map API for frontend chapter discovery.
- Documented Ask API and Study Map API behavior.

### TASK-010: LangChain-First Tutor Engine Architecture and Curriculum Foundation

Status: DONE

Task file:
tasks/TASK-010-tutor-engine-langchain-planning-layer.md

Completed:
- Documented the LangChain-first Tutor Engine architecture.
- Marked the existing rule/hybrid router as a temporary compatibility layer.
- Curriculum Brain foundation from curated Markdown.
- Chapter/topic resolver foundation.
- Resolver regression tests.
- Loader/chunker test path correction so the deterministic regression suite points at root `data/class-10/science`.
- DB-backed Tutor State was completed later in TASK-011 through TASK-014.
- Deterministic lesson flow and grounded lesson generation were completed later in TASK-015 and TASK-016.

Remaining Tutor Engine work is tracked as the next recommended implementation task:
- LangChain structured planner.
- Action executor.
- Conversation regression tests.

### TASK-011: MongoDB/Mongoose Foundation

Status: DONE

Task file:
tasks/TASK-011-mongodb-mongoose-foundation.md

Current scope:
- Add Mongoose dependency.
- Add `MONGODB_URI` environment config.
- Add MongoDB connect/disconnect helper.
- Wire server startup to MongoDB connection.
- Add a DB ping script for Atlas connection verification.
- Add beginner-friendly Mongoose schemas/services for `chat_sessions`, `chat_history`, and `chat_states`.

Verified:
- `npm.cmd run test:chat-db-models` passed against MongoDB Atlas.

### TASK-012: DB-backed Ask API Integration

Status: DONE

Task file:
tasks/TASK-012-db-backed-ask-api-integration.md

Completed:
- Ask API creates a DB chat session when `sessionId` is missing.
- Ask API reuses a DB chat session when `sessionId` is provided.
- Student messages are saved in `chat_history`.
- Tutor responses are saved in `chat_history`.
- `chat_states` is created/updated with basic current state.
- Ask response still returns `session.sessionId`.
- `npm.cmd run test:ask-db` passed against MongoDB Atlas.

### TASK-013: Frontend Session Handling

Status: DONE

Task file:
tasks/TASK-013-frontend-session-handling.md

Completed:
- Frontend reads saved `sessionId` from localStorage.
- First Ask request can be sent without `sessionId`.
- Frontend saves backend returned `session.sessionId`.
- Later Ask requests send saved `sessionId`.
- `npm.cmd run build` passed.
- `npm.cmd run test:ask-db` passed.

### TASK-014: DB-backed Tutor State Context

Status: DONE

Task file:
tasks/TASK-014-db-backed-tutor-state-context.md

Current scope:
- Load saved `chat_states` into Ask API context before routing.
- Save last topic/answer/sources/intent back into `chat_states`.
- Use DB-backed state for metadata follow-up context.

Verified:
- `npm.cmd run test:ask-db` passed with DB state hydration.
- `npm.cmd run test:chat-db-models` passed.
- `npm.cmd run test:study-map` passed.
- `npm.cmd run test:curriculum-resolvers` passed.

### TASK-015: Lesson Start / Continue Backend Flow

Status: DONE

Task file:
tasks/TASK-015-lesson-start-continue-backend-flow.md

Current scope:
- Start lesson from chapter request.
- Continue lesson from DB state.
- Save current topic and completed topics.
- Add lesson flow regression test.

Verified:
- `npm.cmd run test:lesson-flow` passed.
- `npm.cmd run test:ask-db` passed.
- `npm.cmd run test:chat-db-models` passed.
- `npm.cmd run test:study-map` passed.
- `npm.cmd run test:curriculum-resolvers` passed.

### TASK-016: Grounded Lesson Generation from Retrieved Topic Context

Status: DONE

Task file:
tasks/TASK-016-grounded-lesson-generation.md

Completed:
- Added topic-based lesson retrieval scoped to the current chapter.
- Added grounded lesson prompt and LangChain lesson chain.
- Replaced lesson placeholder text with generated lesson content from retrieved chunks.
- Returned sources in lesson start/continue responses.
- Saved lesson sources in session context.
- Strengthened lesson-flow regression test to require sources and reject old placeholder text.

Verified:
- `npm.cmd run test:lesson-flow` passed.
- `npm.cmd run test:ask-db` passed.

### TASK-017: Tutor Engine Planner and Action Executor Foundation

Status: DONE

Task file:
tasks/TASK-017-tutor-engine-planner-executor-foundation.md

Completed:
- Create a small planner/executor foundation so Ask API decisions move out of scattered router/handler logic.
- Add shared tutor action names.
- Add deterministic planner that returns validated action plans.
- Add action executor that owns dispatch to existing handlers, RAG, metadata, and lesson services.
- Add conversation regression tests for core tutor flows.
- Fix state patching so normal doubts and no-context answers do not clear active lesson state.
- Keep current frontend-compatible response behavior.

Verified:
- `npm.cmd run test:tutor-conversations` passed.
- `npm.cmd run test:lesson-flow` passed.
- `npm.cmd run test:ask-db` passed.
- `npm.cmd run test:curriculum-resolvers` passed.
- `npm.cmd run test:study-map` passed.

### TASK-018: Conversation Regression Coverage

Status: DONE

Task file:
tasks/TASK-018-conversation-regression-coverage.md

Completed:
- Expanded backend conversation regression coverage from 3 to 10 multi-turn scenarios.
- Covered Biology subject selection followed by chapter number and next-topic continuation.
- Covered Focus Mode out-of-chapter refusal.
- Covered follow-up doubt context resolution.
- Covered ambiguous chapter-number clarification.
- Covered subject change during an active lesson.
- Covered out-of-scope question during an active lesson without clearing lesson state.
- Covered the tough chapter / difficulty-ranking guardrail so the backend does not guess unsupported rankings.
- Added deterministic extractive-only regression mode for lesson and RAG test scripts.
- Tightened Focus Mode retrieval for Latin/Hinglish questions so unrelated selected-chapter context is refused.

Verified:
- `npm.cmd run test:chunks` passed.
- `npm.cmd run test:study-map` passed.
- `npm.cmd run test:curriculum-resolvers` passed.
- `npm.cmd run test:vector-store` passed.
- `npm.cmd run test:chat-db-models` passed.
- `npm.cmd run test:ask-db` passed.
- `npm.cmd run test:lesson-flow` passed.
- `npm.cmd run test:tutor-conversations` passed.
- `npm.cmd run test:retrieval` passed.
- `npm.cmd run rag:test-retriever` passed.
- Frontend `npm.cmd run build` passed.

### TASK-019: Tutor State and Planner Edge-case Cleanup

Status: DONE

Task file:
tasks/TASK-019-tutor-state-planner-edge-cleanup.md

Completed:
- Added separate `lastDoubtTopic`, `lastDoubtQuestion`, and `lastDoubtSources` fields to chat state.
- Added matching in-memory session context fields.
- Updated DB state hydration so follow-up routing can use saved doubt context.
- Updated follow-up routing and context resolution to prefer last grounded doubt context before lesson topic context.
- Updated Ask API state saving so side doubts during active lessons do not overwrite the active lesson topic.
- Cleared stale doubt context when the student changes learning target or starts a new lesson.
- Strengthened conversation regression tests for side-doubt follow-ups and active lesson state stability.
- Strengthened chat DB model tests for the new state fields.

Verified:
- `npm.cmd run test:chat-db-models` passed.
- `npm.cmd run test:tutor-conversations` passed.
- `npm.cmd run test:lesson-flow` passed.
- `npm.cmd run test:ask-db` passed.
- `npm.cmd run test:curriculum-resolvers` passed.

### TASK-020: Performance Known Issues Backlog

Status: BACKLOG

Task file:
tasks/TASK-020-performance-known-issues-backlog.md

Tracked issues:
- Real LLM-mode QA conversation did not finish within a 10-minute timeout.
- Deterministic regression mode still takes roughly 3-8 seconds per Ask turn.
- Ask API latency likely comes from vector-store loading, embedding calls, LLM calls, MongoDB round trips, and lack of caching/streaming.
- Keep this as a later optimization backlog after the core product goal is stable.

Later expected work:
- Add timing logs.
- Cache loaded vector store in process.
- Reuse embedding/vector-store clients.
- Keep metadata/clarification paths free of RAG/LLM work.
- Consider streaming and production vector DB later.

## Staged Project Roadmap

### Stage 0: Documentation and Project Control

Status: DONE

Completed:
- AGENTS.md
- README.md
- DECISIONS.md
- TASKS.md
- tasks/ folder

### Stage 1: Minimal Backend Foundation

Status: DONE

Completed:
- backend/
- backend/src/
- health API
- env setup
- error handling foundation
- response helper foundation

### Stage 2: Curated Content Foundation

Status: DONE

Completed:
- Clean curated Markdown content path established.
- Hindi PDFs kept as reference only.
- Curated Markdown confirmed as the real RAG source.

### Stage 3: Curated Content Loader

Status: DONE

Completed:
- Markdown files load recursively.
- Metadata is extracted and validated.
- Loader inspection and test scripts exist.

### Stage 4: Chunking Strategy

Status: DONE

Completed:
- Chunker tests passed.
- 600 valid chunks generated from 16 Science documents.

### Stage 5: Embeddings and Vector Store

Status: DONE

Completed:
- Gemini `gemini-embedding-001` selected.
- LangChain `GoogleGenerativeAIEmbeddings` used.
- LangChain `MemoryVectorStore` used.
- Local JSON persistence added at `backend/storage/vector-store.json`.
- 600 vectors saved.

### Stage 6: Retrieval Pipeline

Status: DONE

Completed:
- Query loads saved vector store.
- Query embeds only the user question.
- LangChain `similaritySearchWithScore` retrieves matching chunks.
- Retrieval tested with Hindi, Hinglish, and English queries.

### Stage 7: Grounded Answer Generation

Status: DONE

Completed:
- Retrieved chunks are formatted into grounded context.
- Sources are formatted and attached to answers.
- Grounded tutor prompt is implemented.
- LangChain LCEL answer chain is implemented.
- Simple Hinglish answers are generated.
- Insufficient-context fallback is implemented.
- Extractive fallback exists for model errors.

### Stage 8: Backend API Integration

Status: DONE

Completed:
- Ask question endpoint exists at `POST /api/v1/ask`.
- Study Map endpoint exists at `GET /api/v1/study-map`.
- Global Mode is supported.
- Focus Mode with chapter filter is supported.
- Request validation exists.
- Central error handling is used.
- Structured response format is documented.

### Stage 9: Evaluation and Quality Testing

Status: PARTIAL

Completed:
- Manual API and frontend tests found important tutor-flow gaps.
- Initial router/session improvements were tested.
- Lesson-flow regression test covers lesson start/continue, grounded sources, and old placeholder regression.
- Conversation regression test now covers greeting, subject-only study intent, chapter follow-up lesson start, next topic, metadata chapter count, grounded doubt answer, side-doubt state stability, Biology chapter-number follow-up, Focus Mode out-of-chapter refusal, follow-up doubt context, ambiguous chapter clarification, subject change during lesson, out-of-scope during lesson, and tough chapter guardrail.
- Polish issues from real chat testing are tracked in `docs/polish-notes.md`.

Remaining work:
- Track planner/action failures.
- Improve answer quality, source display, and tone after the core Tutor Engine path is stable.
- Improve API latency later; details are tracked in TASK-020.

### Stage 10: LangChain Tutor Engine

Status: ACTIVE

Completed:
- Curriculum Brain from curated Markdown.
- Chapter/topic resolver.
- DB-backed tutor state.
- Deterministic lesson start/continue flow.
- Grounded lesson generation from retrieved topic context.
- Deterministic planner/action executor foundation.
- Lesson state remains stable when a student asks a side doubt or out-of-scope question during a lesson.
- Expanded conversation regression coverage for planner/state edge cases.
- Last answered doubt context is now stored separately from active lesson topic context.

Expected work:
- Source dedupe and compact backend source contract.
- Performance optimization later; known issues are tracked in TASK-020.
- Optional LangChain structured planner upgrade after deterministic engine behavior is stable.
- Frontend rendering for lesson state and suggested actions.
- More conversation regression coverage as new workflows are added.

### Stage 11: Minimal Frontend Demo

Status: PARTIAL

Completed:
- Zuno React frontend exists.
- Ask question box exists.
- Global/Focus mode exists.
- Chapter selector exists.
- Answer and sources display exists.
- Browser session handling exists through `localStorage` session id.

Remaining work:
- Add lesson state display.
- Add continue lesson action.
- Compact source chips.
- Render structured Tutor Engine actions.

### Stage 12: Deployment Demo

Status: NOT STARTED

Expected work:
- Frontend deployment.
- Backend deployment.
- Env setup.
- Basic usage limit.
- README update.

## Development Rules

- Work on only one task at a time.
- Do not overbuild.
- Do not add auth, database, admin panel, quiz, frontend, analytics, or chat history unless explicitly asked.
- Keep backend separate from content preparation.
- Keep curated content in data folders.
- Do not commit raw PDFs unless explicitly approved.
- Retrieval must stay grounded in indexed source content.

## Next Task Rule

The next recommended backend implementation task is Source Dedupe and Compact Backend Source Contract.

Frontend Lesson Experience Improvements remains the next recommended frontend task.

Do not keep expanding manual router rules as the primary solution. New tutor workflows should move into the Tutor Engine planner/action architecture.
