# Bihar Board AI Tutor

## Goal

Build a Bihar Board Class 10 Science AI Tutor that answers student questions using approved study content through Retrieval-Augmented Generation (RAG).

Students may ask questions in Hindi, Hinglish, or simple English. The final answer should be simple Hinglish and must be grounded only in retrieved/indexed source content.

## Current Status

Backend RAG MVP and the first lesson-flow MVP are working end to end.

Completed:

- Curated Science Markdown loader.
- RAG chunker.
- LangChain-based Gemini embeddings.
- LangChain MemoryVectorStore retrieval.
- Local JSON vector-store persistence.
- Lightweight reranking and final retrieval filtering.
- Grounded LLM answer generation.
- Simple Hinglish answers with source attribution.
- Safe fallback when retrieved context is insufficient.
- Study Map API for available chapters.
- Ask API with Global Mode and Focus Mode.
- MongoDB-backed chat sessions, chat history, and tutor state.
- Lesson start/continue flow.
- Grounded lesson generation from retrieved topic context.
- Deterministic Tutor Engine planner/action executor foundation.
- Conversation regression test for core tutor flows.
- Lesson state stability across side doubts and no-context answers.
- Zuno React frontend foundation.
- Initial temporary router/session layer for greetings, study intent, metadata, and simple follow-ups.

Not included yet:

- Production vector DB.
- Production deployment.
- Formal evaluation question set.
- Optional LangChain structured planner upgrade.
- Frontend lesson-specific UI polish.

## Initial Scope

- Class 10 Science only.
- Current curated content includes 16 Science chapter Markdown files across Physics, Chemistry, and Biology.
- Backend RAG pipeline first.
- Source content stored locally as clean text files first.
- Local vector store or JSON-based persisted store first.
- Ask API is implemented for question answering and lesson flow.

## Architecture Summary

```text
Study Content
-> Data Loader
-> Text Cleaner
-> Chunker
-> Metadata Builder
-> Embedding Generator
-> Local Vector Store
-> Retriever
-> Grounded Prompt Builder
-> LLM Answer Generator
-> Hinglish Answer with Sources
```

Student question flow:

```text
Student Question
-> API Endpoint
-> Query Processing
-> Vector Search
-> Relevant Chunks
-> Grounded Hinglish Prompt
-> LLM
-> Answer + Sources + Status
```

Next architecture direction:

```text
User Message
-> Tutor State
-> Curriculum Context
-> LangChain Planner
-> Action Executor
-> RAG / Lesson Chains
-> Updated Tutor State
-> Structured API Response
```

See:

```text
docs/tutor-engine-langchain-architecture.md
```

## RAG Commands

Run commands from the `backend/` folder.

Create or refresh the local vector store:

```bash
npm run rag:index
```

This command loads the curated Science documents, chunks them, creates LangChain documents, generates Gemini embeddings, builds a LangChain `MemoryVectorStore`, and saves it to:

```text
backend/storage/vector-store.json
```

Retrieve relevant chunks for a question:

```bash
npm run rag:query -- "your question"
```

Example:

```bash
npm run rag:query -- "प्रकाश संश्लेषण क्या होता है?"
```

The query command loads saved vectors from `vector-store.json`. It does not re-embed all chunks; it embeds only the user question and prints retrieved chunks with scores and metadata.

## First Milestone

The original first milestone was to create a minimal backend pipeline that can:

1. Load curated Class 10 Science chapter text files.
2. Clean and normalize text.
3. Chunk content with useful metadata.
4. Generate embeddings.
5. Persist chunks in a local vector store or JSON-based store.
6. Retrieve relevant chunks for a student question.
7. Generate a simple Hinglish answer grounded only in retrieved chunks.
8. Return answer, sources, and status from one API endpoint.

Current backend status:

- Steps 1-8 are implemented for local backend testing.
- The active curated dataset contains 16 Science chapters.
- The local vector store has been generated at `backend/storage/vector-store.json`.
- The Ask API is available at `POST /api/v1/ask`.
- The Study Map API is available at `GET /api/v1/study-map`.
- MongoDB-backed session/history/state is implemented.
- The Zuno frontend foundation exists under `frontend/`.
- The lesson flow can start and continue topics with grounded lesson content and sources.
- The Tutor Engine planner/action executor foundation is implemented.
- The next work is frontend lesson experience improvements.

## Intentionally Not Included Yet

- Admin panel.
- Analytics.
- Quiz system.
- Authentication.
- PDF/OCR pipeline.
- Production vector database.
