# TASKS.md

## Project

Bihar Board Class 10 Science AI Tutor

## Current Direction

The project uses curated English Markdown files as the primary knowledge source for RAG.

Hindi PDFs are reference material only.

The app should not depend on raw PDF parsing quality for production RAG content.

## Current Active Task

TASK-009: RAG Answer Generation Pipeline

Task file:
To be created when implementation starts.

Goal:
Use retrieved chunks to generate grounded simple Hinglish answers with sources, and refuse when retrieved context is insufficient.

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

Status: NEXT

Next task:
- Take retrieved chunks.
- Format sources.
- Build grounded prompt.
- Use LLM through LangChain.
- Generate simple Hinglish answer.
- Show sources.
- Refuse when context is insufficient.
- Avoid hallucination.

### Stage 8: Backend API Integration

Status: NOT STARTED

Expected work:
- Ask question endpoint.
- Chapter filter support.
- Request validation.
- Error handling.
- Response format.

### Stage 9: Evaluation and Quality Testing

Status: NOT STARTED

Expected work:
- Prepare test questions.
- Check retrieval quality.
- Check answer quality.
- Track failure cases.
- Improve content/chunking if needed.

### Stage 10: Minimal Frontend Demo

Status: NOT STARTED

Expected work:
- React frontend.
- Ask question box.
- Chapter selector.
- Answer display.
- Source display.

### Stage 11: Deployment Demo

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

The next approved task is the RAG answer generation pipeline.
