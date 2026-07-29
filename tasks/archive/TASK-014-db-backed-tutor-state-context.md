# TASK-014: DB-backed Tutor State Context

## Status

DONE

## Why This Task Exists

Ask API turns are now saved in MongoDB, but at the start of this task the active tutor context still mostly came from the old in-memory session context.

The backend should begin using `chat_states` as the saved source of current learning context.

## Goal

Load context from `chat_states` at the start of an Ask API request and save useful context back after the tutor responds.

## Scope

Add:

- Load saved `chat_states` into the temporary session context before routing.
- Save last topic, answer, sources, and intent into `chat_states`.
- Preserve existing state fields when a new response does not include them.
- Let metadata questions use DB-backed subject/section context.
- Extend Ask DB integration test to prove DB state hydration.

Do not add yet:

- Full LangChain Planner.
- Lesson start/continue executor.
- JWT auth.
- Chat history loading endpoint.

## Current Implementation Status

- `chat_states` now stores `lastIntent`, `lastTopic`, `lastAnswer`, and `lastSources`.
- `saveSessionContext` added for simple context hydration without increasing turn count.
- Ask API loads DB state into session context before routing.
- Ask API saves useful context back to DB after response.
- Metadata handler can use `sessionContext.lastSubject` / `sessionContext.lastSection` when route hints are missing.
- `npm.cmd run test:ask-db` includes DB state hydration coverage.
- `npm.cmd run test:ask-db` passed with `dbHydratedSection: physics`.

## Verification Commands

From `backend/`:

```bash
npm.cmd run test:ask-db
npm.cmd run test:chat-db-models
npm.cmd run test:study-map
npm.cmd run test:curriculum-resolvers
```

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

Build backend lesson start/continue flow using the curriculum resolver and DB-backed state.
