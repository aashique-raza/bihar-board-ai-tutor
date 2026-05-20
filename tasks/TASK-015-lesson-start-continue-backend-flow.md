# TASK-015: Lesson Start / Continue Backend Flow

## Status

DONE

## Why This Task Exists

The backend can save chat sessions/history/state, and it can resolve chapters/topics. Now Zuno needs the first real tutor flow:

```text
physics chapter 3 padhao
next
```

## Goal

Start and continue a lesson using the curriculum index and DB-backed chat state.

## Scope

Add:

- Deterministic lesson start for chapter requests.
- Deterministic lesson continue for `next` style messages.
- Current chapter/topic updates in `chat_states`.
- Completed topic tracking.
- Simple Hinglish lesson-path response.
- Backend test for start + continue flow.

Do not add yet:

- LangChain Planner.
- Frontend lesson UI changes.
- Quiz/check-answer flow.

## Current Implementation Status

- `backend/src/services/lessonFlow.service.js` added.
- Ask API checks lesson flow before old router/RAG flow.
- `physics chapter 3 padhao` starts Physics chapter 3 using first core topic.
- `next` continues to the next core topic using DB state.
- `chat_states.currentChapterId`, `currentTopicId`, `learningMode`, `pendingAction`, and `completedTopicIds` are updated.
- `npm.cmd run test:lesson-flow` added.
- `npm.cmd run test:lesson-flow` passed against MongoDB Atlas.

## Verification Commands

From `backend/`:

```bash
npm.cmd run test:lesson-flow
npm.cmd run test:ask-db
npm.cmd run test:chat-db-models
```

Latest verification:

```text
test:lesson-flow: passed
test:ask-db: passed
test:chat-db-models: passed
test:study-map: passed
test:curriculum-resolvers: passed
test:loader: 20/20 passed
test:chunks: 27/27 passed
```

## Next Step After This Task

Grounded lesson generation is now completed in TASK-016.
