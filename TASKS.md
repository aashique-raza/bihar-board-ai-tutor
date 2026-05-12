# TASKS.md

## Current Active Next Task

Stage 1: Minimal backend setup only

## Staged Checklist

### Stage 0: Documentation/context setup

- [x] Recreate `AGENTS.md`.
- [x] Recreate `README.md`.
- [x] Recreate `TASKS.md`.
- [x] Recreate `DECISIONS.md`.
- [x] Recreate docs folder documentation.
- [x] Confirm project direction and first milestone limits.

### Stage 1: Minimal backend setup

- [ ] Create a minimal backend folder structure only.
- [ ] Add basic Node.js project files only if requested.
- [ ] Add a simple health endpoint only if requested.
- [ ] Do not add RAG implementation yet.
- [ ] Do not install packages without approval or clear need.

### Stage 2: Data folder + two verified chapter text files

- [ ] Create a local source content folder.
- [ ] Add only 2 verified Class 10 Science chapter text files.
- [ ] Keep chapter names TBD until verified.
- [ ] Record source metadata for each file.

### Stage 3: Loader

- [ ] Load local text files.
- [ ] Preserve file-level metadata.
- [ ] Validate that only approved files are loaded.

### Stage 4: Cleaner

- [ ] Normalize whitespace.
- [ ] Remove irrelevant noise.
- [ ] Preserve meaningful Hindi text.
- [ ] Avoid changing educational meaning.

### Stage 5: Chunker + metadata

- [ ] Split cleaned text into chunks.
- [ ] Attach chapter/source/page/section metadata where available.
- [ ] Keep chunks traceable to original content.

### Stage 6: Embeddings

- [ ] Choose embedding provider/model.
- [ ] Generate embeddings for chunks.
- [ ] Store embedding metadata.

### Stage 7: Local vector store persistence

- [ ] Persist chunks and embeddings locally.
- [ ] Support rebuild from source text.
- [ ] Avoid database setup.

### Stage 8: Retriever

- [ ] Accept a student question.
- [ ] Search local vector store.
- [ ] Return top relevant chunks with metadata.
- [ ] Handle low-confidence or empty retrieval.

### Stage 9: Grounded Hinglish answer generator

- [ ] Build a prompt using only retrieved chunks.
- [ ] Generate simple Hinglish answer.
- [ ] Refuse when retrieved content is insufficient.
- [ ] Include sources in output.

### Stage 10: API endpoint

- [ ] Add one question-answer endpoint.
- [ ] Return answer, sources, and status.
- [ ] Keep API contract simple and testable.

### Stage 11: Evaluation/debugging

- [ ] Add small manual test set.
- [ ] Test Hindi, Hinglish, and simple English questions.
- [ ] Test insufficient-context refusal.
- [ ] Inspect retrieved chunks and source attribution.

### Stage 12: Frontend later

- [ ] Defer until backend RAG flow works.

### Stage 13: Admin later

- [ ] Defer content management/admin workflows.

### Stage 14: Database later

- [ ] Defer MongoDB/Postgres.
- [ ] Defer user, chat history, feedback, and metadata persistence.

### Stage 15: Quiz/analytics later

- [ ] Defer quizzes.
- [ ] Defer analytics.
- [ ] Defer dashboards and reporting.
