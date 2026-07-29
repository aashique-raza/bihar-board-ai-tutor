# TASK-018: Conversation Regression Coverage

Status: DONE

## Goal

Expand backend conversation regression coverage so Tutor Engine changes are tested against realistic multi-turn student flows, not only isolated questions.

## Scope

- Add regression coverage for subject-to-chapter-to-next lesson flow.
- Add Focus Mode out-of-chapter refusal coverage.
- Add follow-up doubt context resolution coverage.
- Add ambiguous chapter number clarification coverage.
- Add subject change during an active lesson coverage.
- Add out-of-scope question during active lesson state-stability coverage.
- Add tough chapter / difficulty-ranking guardrail coverage.
- Keep tests deterministic enough for regular backend QA runs.

## Completed

- Expanded `backend/scripts/test-tutor-conversations.js` from 3 to 10 conversation scenarios.
- Added deterministic `RAG_EXTRACTIVE_ONLY=true` mode for regression scripts so tests validate retrieval/state behavior without waiting on LLM generation.
- Added explicit ambiguous chapter-number clarification in the deterministic planner.
- Added a metadata guardrail for chapter difficulty-ranking questions so the tutor does not guess unsupported difficulty rankings.
- Tightened Focus Mode retrieval for Latin/Hinglish queries by requiring a term match inside the selected chapter context.
- Updated lesson-flow regression script to use deterministic extractive mode.

## Verified

- `npm.cmd run test:chunks` passed.
- `npm.cmd run test:study-map` passed.
- `npm.cmd run test:curriculum-resolvers` passed.
- `npm.cmd run test:vector-store` passed.
- `npm.cmd run test:chat-db-models` passed.
- `npm.cmd run test:ask-db` passed.
- `npm.cmd run test:lesson-flow` passed.
- `npm.cmd run test:tutor-conversations` passed.
- `npm.cmd run test:retrieval` passed.
- `npm.cmd run rag:test-retriever` passed.
- Frontend `npm.cmd run build` passed.

## Notes

- The production answer and lesson generation paths still use the configured LLM by default.
- `RAG_EXTRACTIVE_ONLY=true` is set only inside regression scripts unless explicitly set in the environment.
- Remaining backend improvement area: state/planner edge-case cleanup, especially separation of lesson state from last answered doubt context.
