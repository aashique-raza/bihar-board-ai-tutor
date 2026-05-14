# TASKS.md

## Execution Rules

1. Only one stage/task can be active at a time.
2. Codex must complete the active task only.
3. Codex must not start the next stage without approval.
4. Every task must include:
   - Goal
   - Allowed Changes
   - Forbidden Changes
   - Acceptance Criteria
   - Test Plan
5. A stage is complete only when acceptance criteria pass.
6. Do not add frontend, auth, database, admin, quiz, deployment, embeddings, or RAG unless the active task explicitly asks for it.
7. Do not install packages without listing why they are needed.
8. After every task, Codex must report:
   - Files created/changed
   - Commands run
   - How to test
   - Any assumptions made

## Current Active Next Task

### TASK-002: Local Source Content Folder Setup

Status: TODO

Task File:
tasks/TASK-002-local-source-content-setup.md

Goal:
Create the local source content folder structure and metadata tracking format for the first 2 verified Class 10 Science chapters.

Important:
Do not write or invent chapter content. Actual chapter text will be added only after source verification.

Allowed Changes:
- Create local content folder structure.
- Create metadata template for source tracking.
- Create README explaining how verified content should be added.
- Prepare placeholder folder names only if needed.

Forbidden Changes:
- Do not add fake educational content.
- Do not add unverified chapter notes.
- Do not add embeddings.
- Do not add loader code.
- Do not add cleaner code.
- Do not add RAG code.
- Do not modify backend code.

Acceptance Criteria:
- Content folder structure is clearly defined.
- Source metadata format is ready.
- No fake study content exists.
- Next step is ready for adding 2 verified chapter text files.

Test Plan:
- Confirm folder structure exists.
- Confirm metadata JSON is valid.
- Confirm no unverified educational content was added.
- Confirm backend code was not changed.

## Staged Checklist

### Stage 0: Documentation/context setup

- [x] Recreate `AGENTS.md`.
- [x] Recreate `README.md`.
- [x] Recreate `TASKS.md`.
- [x] Recreate `DECISIONS.md`.
- [x] Recreate docs folder documentation.
- [x] Confirm project direction and first milestone limits.

### Stage 1: Minimal backend setup

- [x] Create `backend/` folder.
- [x] Initialize Node.js project.
- [x] Configure ES Modules.
- [x] Install only required packages:
  - express
  - dotenv
  - cors
  - morgan
  - nodemon as dev dependency
- [x] Add basic Express app.
- [x] Add `/health` endpoint.
- [x] Add centralized error handling.
- [x] Add `.env.example`.
- [x] Add clean folder structure.
- [x] Verify server runs locally.
- [x] Do not add RAG implementation.
- [x] Do not add database.
- [x] Do not add auth.
- [x] Do not add frontend.

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
