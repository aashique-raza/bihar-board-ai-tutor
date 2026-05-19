# TASK-012: DB-backed Ask API Integration

## Status

DONE

## Why This Task Exists

MongoDB/Mongoose setup is done and the first chat collections exist:

```text
chat_sessions
chat_history
chat_states
```

The Ask API still needs to use these collections so each conversation has a saved session, chat history, and current state.

## Goal

Wire the current `/api/v1/ask` flow to MongoDB without changing the tutor behavior yet.

## Scope

Add:

- Optional `sessionId` support from request body.
- New `chat_sessions` document when no `sessionId` is sent.
- Student message save in `chat_history`.
- Tutor answer save in `chat_history`.
- Basic `chat_states` create/update.
- `sessionId` returned in the existing response session object.
- A DB integration test for Ask API.

Do not add yet:

- JWT auth.
- Login/guest account linking.
- Full LangChain Planner.
- Lesson generator.
- Frontend session storage changes.

## Current Implementation Status

- Ask API creates a DB chat session when `sessionId` is missing.
- Ask API reuses a DB chat session when `sessionId` is provided.
- Student message is saved before routing.
- Tutor response is saved before returning.
- Chat state is updated with study mode, last action, last student message, and available in-memory context.
- `npm.cmd run test:ask-db` added.
- `npm.cmd run test:ask-db` passed against MongoDB Atlas.

## Verification Commands

From `backend/`:

```bash
npm.cmd run test:ask-db
npm.cmd run test:chat-db-models
npm.cmd run test:study-map
```

`test:ask-db` uses a greeting message so it does not require LLM/RAG generation.

Latest verification:

```text
db:ping: passed
test:ask-db: passed
test:chat-db-models: passed
test:study-map: passed
test:curriculum-resolvers: passed
test:loader: 20/20 passed
test:chunks: 27/27 passed
```

## Next Step After This Task

Update frontend/session handling so the browser sends the returned `sessionId` on the next Ask API request.
