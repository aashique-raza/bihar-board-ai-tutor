# TASK-019: Tutor State and Planner Edge-case Cleanup

Status: DONE

## Goal

Keep active lesson state separate from last answered doubt context so follow-up questions resolve correctly without losing lesson progress.

## Scope

- Clarify the role of lesson state versus doubt context.
- Preserve active lesson `currentTopicId` and `completedTopicIds` when a student asks a side doubt.
- Save last grounded doubt context separately for follow-up questions like `iska function kya hai`.
- Keep implementation small and beginner-readable.

## Completed

- Added `lastDoubtTopic`, `lastDoubtQuestion`, and `lastDoubtSources` to chat state.
- Added matching in-memory session context fields.
- Updated DB state hydration so last doubt context is available during routing.
- Updated follow-up routing/resolution to prefer `lastDoubtTopic` before lesson `lastTopic`.
- Updated Ask API state saving so answered doubts save separate doubt context even during an active lesson.
- Cleared stale doubt context when the student changes learning target or starts a new lesson.
- Strengthened conversation regression checks to ensure side-doubt follow-ups use the doubt topic and do not overwrite active lesson state.
- Strengthened DB model tests for the new state fields.

## Verified

- `npm.cmd run test:chat-db-models` passed.
- `npm.cmd run test:tutor-conversations` passed.
- `npm.cmd run test:lesson-flow` passed.
- `npm.cmd run test:ask-db` passed.
- `npm.cmd run test:curriculum-resolvers` passed.

## Notes

- Existing `lastTopic` remains for backward compatibility and lesson context.
- `lastDoubtTopic` is now the preferred context for follow-up doubt resolution.
- This task intentionally does not add a LangChain structured planner or new frontend behavior.
