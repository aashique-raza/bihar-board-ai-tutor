# TASK-013: Frontend Session Handling

## Status

DONE

## Why This Task Exists

The Ask API now creates and returns a DB-backed `sessionId`.

The frontend must keep using that same `sessionId` so future messages are saved under the same `chat_sessions`, `chat_history`, and `chat_states` records.

## Goal

Store the backend returned `sessionId` in the browser and send it with the next Ask API request.

## Scope

Add:

- Read saved `sessionId` from `localStorage`.
- First request may be sent without a `sessionId`.
- Save `answerPayload.session.sessionId` after the backend responds.
- Send saved `sessionId` on later Ask API calls.

Do not add yet:

- Login.
- JWT.
- Chat history loading UI.
- New frontend pages.
- Frontend redesign.

## Current Implementation Status

- `frontend/src/utils/session.js` now has simple `getSavedSessionId` and `saveSessionId` helpers.
- `frontend/src/api/tutorApi.js` sends `sessionId` only when one exists.
- `frontend/src/App.jsx` saves the backend returned `sessionId`.
- `npm.cmd run build` passed.
- `npm.cmd run test:ask-db` passed.

## Verification Commands

From `frontend/`:

```bash
npm.cmd run build
```

From `backend/`:

```bash
npm.cmd run test:ask-db
```

## Next Step After This Task

Chat history loading from DB is still a later product feature. The immediate core path moved to DB-backed tutor state, lesson flow, and Tutor Engine planning.
