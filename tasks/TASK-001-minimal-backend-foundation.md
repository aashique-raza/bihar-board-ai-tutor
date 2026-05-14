# TASK-001: Minimal Backend Foundation

Status: DONE

## Goal

Create a minimal backend foundation for the Bihar Board Class 10 Science AI Tutor project.

This task only prepares the backend base. It does not implement RAG, database, auth, frontend, admin panel, or AI logic.

## Context

The project is a Bihar Board Class 10 Science AI Tutor.

Current confirmed architecture:

1. Content Management Flow
   - Admin/Teacher uploads content
   - Extract Text/OCR
   - Clean Text
   - Split into chunks
   - Add metadata
   - Create embeddings
   - Store in Vector DB + Metadata DB + File Storage

2. Student Learning Flow
   - Student login/guest access
   - Ask question
   - Detect class/subject/chapter
   - Search relevant chunks
   - Build RAG prompt
   - AI generates answer
   - Validate answer
   - Show answer + sources + quiz

3. Storage Layer
   - Vector DB
   - Metadata DB
   - File Storage

4. Admin/Teacher Layer
   - Manage content
   - Review answers
   - Fix wrong responses
   - Manage quiz
   - View analytics

5. Safety/Control Layer
   - Rate limiting
   - Daily question limit
   - Out-of-syllabus detection
   - Low-confidence fallback
   - Logs and monitoring

## Allowed Changes

- Create `backend/` folder.
- Initialize Node.js project inside `backend/`.
- Configure ES Modules.
- Add Express server.
- Add `/health` endpoint.
- Add centralized error response.
- Add `.env.example`.
- Add basic backend folder structure.
- Install only these packages if implementing this task later:
  - express
  - dotenv
  - cors
  - morgan
  - nodemon as dev dependency

## Forbidden Changes

- Do not add RAG logic.
- Do not add embeddings.
- Do not add vector store.
- Do not add database.
- Do not add authentication.
- Do not add frontend.
- Do not add admin panel.
- Do not add quiz logic.
- Do not add deployment config.
- Do not add sample study content.
- Do not add chapter data.
- Do not add AI provider integration.

## Expected Folder Structure

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

## Acceptance Criteria

- `npm run dev` starts the backend server.
- `GET /health` returns a JSON success response.
- Unknown routes return a clean JSON error.
- Server port comes from environment config.
- No database connection exists.
- No RAG code exists.
- No frontend code exists.
- Code follows `docs/05-coding-standards.md`.
- Changed files are reported after implementation.

## Test Plan

After implementation, run:

1. `cd backend`
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:5000/health`
5. Open `http://localhost:5000/wrong-route`

Expected result:

- `/health` returns success JSON.
- `/wrong-route` returns clean JSON error.
- Server does not crash.

## Completion Report Required

After implementing this task later, Codex must report:

- Files created
- Files changed
- Packages installed
- Commands run
- How to test
- Assumptions made
