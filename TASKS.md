# TASKS.md

## Project

Bihar Board Class 10 Science AI Tutor

## Current Direction

The project uses curated English Markdown files as the primary knowledge source for RAG.

Hindi PDFs are reference material only.

The app should not depend on raw PDF parsing quality for production RAG content.

## Current Active Task

TASK-012: DB-backed Ask API Integration

Task file:
To be created when implementation starts.

Goal:
Wire `chat_sessions`, `chat_history`, and `chat_states` into the Ask API so every conversation can persist history and current learning state.

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

### TASK-010: LangChain-First Tutor Engine Planning Layer

Status: PAUSED

Task file:
tasks/TASK-010-tutor-engine-langchain-planning-layer.md

Current scope:
- Document the LangChain-first Tutor Engine architecture.
- Treat existing rule/hybrid router as a temporary compatibility layer, not the final solution.
- Plan Curriculum Brain, Tutor State, LangChain Planner, Action Executor, Lesson Generator, and conversation tests.
- Keep implementation future-ready for Math, Hindi, English, Social Science, Urdu, and Sanskrit.

Latest completed within TASK-010:
- Curriculum Brain foundation from curated Markdown.
- Chapter/topic resolver foundation.
- Resolver regression tests.
- Loader/chunker test path correction so the deterministic regression suite points at root `data/class-10/science`.

Next scope:
- Tutor State schema/store.

Pause reason:
- Tutor State should be DB-backed because chat history will be needed soon.
- MongoDB/Mongoose setup is now the immediate prerequisite.

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

Remaining work:
- Add conversation-level regression tests.
- Track planner/action failures.
- Improve answer quality and source display.

### Stage 10: LangChain Tutor Engine

Status: ACTIVE

Completed:
- Curriculum Brain from curated Markdown.
- Chapter/topic resolver.

Expected work:
- Tutor State.
- LangChain structured planner.
- Action executor.
- Lesson generation chain.
- Conversation regression tests.

### Stage 11: Minimal Frontend Demo

Status: PARTIAL

Completed:
- Zuno React frontend exists.
- Ask question box exists.
- Global/Focus mode exists.
- Chapter selector exists.
- Answer and sources display exists.

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

The next recommended implementation task is DB-backed Ask API Integration.

Do not keep expanding manual router rules as the primary solution. New tutor workflows should move into the Tutor Engine planner/action architecture.
