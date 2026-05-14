# TASKS.md

## Execution Rules

1. Only one stage/task can be active at a time.
2. Codex must complete the active task only.
3. Codex must not start the next task without owner approval.
4. Every task must include:
   - Goal
   - Allowed Changes
   - Forbidden Changes
   - Acceptance Criteria
   - Test Plan
5. A stage is complete only when acceptance criteria pass.
6. Do not add frontend, auth, database, admin, quiz, deployment, embeddings, vector DB, PDF processing, content processing, or RAG unless the active task explicitly asks for it.
7. Do not install packages without listing why they are needed.
8. After every task, Codex must report:
   - Files created/changed/deleted
   - Commands run
   - How to test
   - Any assumptions made

## Current Active Task

No active task.

## Last Completed Task

### TASK-001: Minimal Backend Foundation

Status: DONE

Task file:
tasks/TASK-001-minimal-backend-foundation.md

## Next Task

Requires owner approval.

Do not start TASK-002 automatically.
