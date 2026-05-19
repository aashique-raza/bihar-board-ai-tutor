# TASK-011: MongoDB/Mongoose Foundation

## Status

DONE

## Why This Task Exists

Tutor State was the next planned step, but Zuno will need chat history and persistent session state soon.

The project owner has prior experience with MongoDB and Mongoose, and already has MongoDB Atlas and Compass available. So the next step is to pause the old in-memory state plan and set up a thin MongoDB/Mongoose foundation first.

## Goal

Add the minimum backend database foundation needed for upcoming DB-backed tutor state and chat history.

## Scope

Add:

- Mongoose dependency.
- `MONGODB_URI` environment variable support.
- MongoDB connect/disconnect helper.
- Server startup DB connection.
- DB ping script for Atlas verification.
- `.env.example` with a safe placeholder.
- Chat DB schemas for current MVP persistence.

Do not add yet:

- Auth.
- Admin panel.
- Analytics.
- Quiz history.
- Production vector DB.
- MongoDB vector search.
- API endpoints for chat history.
- JWT/login logic.

## Current Implementation Status

- `mongoose` dependency added.
- `MONGODB_URI` added to backend env config.
- `backend/src/db/mongooseClient.js` added.
- `backend/scripts/test-mongo-connection.js` added.
- `npm.cmd run db:ping` added.
- Server startup now connects to MongoDB before listening.
- Server shutdown disconnects MongoDB cleanly.
- `backend/.env.example` added with placeholder Atlas URI.
- `chat_sessions` collection added through `ChatSession` model.
- `chat_history` collection added through `ChatHistory` model.
- `chat_states` collection added through `ChatState` model.
- Simple services added for session, history, and state.
- `npm.cmd run test:chat-db-models` added.
- `npm.cmd run test:chat-db-models` passed against MongoDB Atlas.

## Collections

### `chat_sessions`

Stores one chat or learning thread.

Important fields:

- `sessionId`: public id used by frontend/backend.
- `userId`: null for guest mode now, user id later after login.
- `mode`: `guest` or `logged_in`.
- `title`: simple chat title.
- `lastMessageAt`: last activity time.

### `chat_history`

Stores what student and tutor said.

Important fields:

- `sessionId`: links message to one chat session.
- `role`: `student` or `tutor`.
- `text`: actual message text.
- `action`: tutor action such as `start_lesson` or `answer_doubt`.
- `sources`: RAG source chunks for tutor answers.
- `metadata`: extra context such as chapter/topic ids.

### `chat_states`

Stores where the student currently is in the learning flow.

Important fields:

- `sessionId`: one state per chat session.
- `currentSubjectId`, `currentSectionId`, `currentChapterId`, `currentTopicId`: current learning target.
- `learningMode`: `idle`, `lesson`, `doubt`, or `revision`.
- `preferredStudyMode`: `global` or `focus`.
- `pendingAction`: expected next action, such as `continue_lesson`.
- `completedTopicIds`: lesson progress.
- `lastTutorAction`, `lastStudentMessage`: simple follow-up context.

## Local Setup

Create `backend/.env` with:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/bihar_board_ai_tutor?retryWrites=true&w=majority&appName=Cluster0
```

Never commit the real `.env` file.

## Verification Commands

From `backend/`:

```bash
npm.cmd run db:ping
npm.cmd run test:chat-db-models
npm.cmd run test:study-map
```

`db:ping` requires a real `MONGODB_URI` and Atlas Network Access allowing the current IP.

Latest verification:

```text
db:ping: passed
test:chat-db-models: passed
test:study-map: passed
test:curriculum-resolvers: passed
test:loader: 20/20 passed
test:chunks: 27/27 passed
```

## Next Step After This Task

Start the next task: wire these DB services into the Ask API flow.

```text
chat_sessions
chat_history
chat_states
```
