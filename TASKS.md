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

### TASK-001: Minimal Backend Foundation

Status: TODO

Task File:
tasks/TASK-001-minimal-backend-foundation.md

Goal:
Create a minimal backend foundation for the Bihar Board Class 10 Science AI Tutor project.

Allowed Changes:
- Create `backend/` folder.
- Initialize Node.js project inside `backend/`.
- Use ES Modules.
- Add Express server.
- Add `/health` endpoint.
- Add basic centralized error response.
- Add `.env.example`.
- Add basic folder structure.

Forbidden Changes:
- Do not add RAG logic.
- Do not add embeddings.
- Do not add vector store.
- Do not add database.
- Do not add authentication.
- Do not add frontend.
- Do not add admin panel.
- Do not add quiz logic.
- Do not add deployment config.

Expected Folder Structure:

```text
backend/
  package.json
  .env.example
  src/
    app.js
    server.js
    config/
      env.js
    routes/
      health.routes.js
    controllers/
      health.controller.js
    middlewares/
      error.middleware.js
    utils/
      ApiError.js
      sendResponse.js
```

Acceptance Criteria:
- `npm run dev` starts the backend server.
- `GET /health` returns a JSON success response.
- Unknown routes return a clean JSON error.
- No database connection exists.
- No RAG code exists.
- No frontend code exists.

Test Plan:
- Run `npm install`.
- Run `npm run dev`.
- Open `http://localhost:5000/health`.
- Test invalid route like `/wrong-route`.

## Staged Checklist

### Stage 0: Documentation/context setup

- [x] Recreate `AGENTS.md`.
- [x] Recreate `README.md`.
- [x] Recreate `TASKS.md`.
- [x] Recreate `DECISIONS.md`.
- [x] Recreate docs folder documentation.
- [x] Confirm project direction and first milestone limits.

### Stage 1: Minimal backend setup

- [ ] Create `backend/` folder.
- [ ] Initialize Node.js project.
- [ ] Configure ES Modules.
- [ ] Install only required packages:
  - express
  - dotenv
  - cors
  - morgan
  - nodemon as dev dependency
- [ ] Add basic Express app.
- [ ] Add `/health` endpoint.
- [ ] Add centralized error handling.
- [ ] Add `.env.example`.
- [ ] Add clean folder structure.
- [ ] Verify server runs locally.
- [ ] Do not add RAG implementation.
- [ ] Do not add database.
- [ ] Do not add auth.
- [ ] Do not add frontend.

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
