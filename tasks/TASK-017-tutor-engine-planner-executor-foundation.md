# TASK-017: Tutor Engine Planner and Action Executor Foundation

## Status

READY

## Why This Task Exists

Zuno now has working pieces:

- grounded RAG answers,
- DB-backed chat sessions/history/state,
- Curriculum Brain,
- chapter/topic resolvers,
- lesson start/continue flow,
- grounded lesson generation.

But Ask API decision-making is still split across `ask.service.js`, lesson flow, temporary routers, handlers, and context helpers.

The next core goal is to move decision-making toward a clean Tutor Engine:

```text
User Message
-> Load Tutor State
-> Build Curriculum Context
-> Plan Action
-> Execute Action
-> Save Tutor State
-> Return Structured Response
```

## Goal

Create the first planner/executor foundation without overbuilding.

This task should make future flows easier to add without growing scattered manual routing code.

## Scope

Add:

- Shared action names for tutor workflows.
- A planner module that returns a validated action plan.
- An action executor module that calls existing services/chains.
- Conversation regression test script for the most important flows.
- Integration path that can run behind the existing Ask API without breaking current behavior.

Initial actions should cover only current needs:

```text
respond_smalltalk
set_learning_target
answer_metadata
start_lesson
continue_lesson
answer_doubt
ask_clarification
refuse_out_of_scope
```

Use existing code where possible:

- `generateRagAnswer`
- `getLessonResponse`
- curriculum resolvers
- metadata/greeting/clarification handlers
- DB-backed chat state services

## Keep It Simple

- Do not add LangGraph yet.
- Do not add a new database table unless clearly needed.
- Do not add quizzes.
- Do not add auth.
- Do not redesign the frontend.
- Do not remove the temporary router until regression tests prove replacement behavior.

## Acceptance Criteria

- Planner output is a small validated object, not free-form text.
- Executor owns action dispatch in one place.
- Ask API behavior remains compatible with the current frontend.
- Existing tests still pass.
- New conversation regression test covers at least:
  - greeting,
  - subject-only study intent,
  - chapter start,
  - next topic,
  - grounded doubt answer,
  - metadata chapter count.

## Verification Commands

From `backend/`:

```bash
npm.cmd run test:tutor-conversations
npm.cmd run test:lesson-flow
npm.cmd run test:ask-db
npm.cmd run test:curriculum-resolvers
npm.cmd run test:study-map
```

## Notes

Polish issues from real chat testing are tracked in:

```text
docs/polish-notes.md
```

Do not spend this task polishing tone/source display unless it is required for planner correctness.
