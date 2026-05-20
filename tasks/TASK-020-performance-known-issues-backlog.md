# TASK-020: Performance Known Issues Backlog

Status: BACKLOG

## Why This Exists

Manual QA after TASK-018 and TASK-019 showed that the tutor behavior is working, but API calls are too slow for a smooth student experience.

This task records the known performance problems so they are not forgotten. Do not optimize these until the core product goal is stable enough, unless latency starts blocking active development.

## Current Observations

- Real LLM-mode QA conversation did not finish within a 10-minute timeout.
- Deterministic regression mode still took roughly 3-8 seconds per Ask turn.
- Lesson start/continue and grounded doubt answers are slower than metadata/clarification responses.
- The frontend can feel stuck because responses take too long and there is no streaming/progress UX yet.

## Likely Causes

- The local JSON vector store may be loaded or rebuilt into memory too often per request.
- Each RAG question needs an embedding API call.
- Lesson generation and answer generation call the configured LLM.
- MongoDB Atlas adds network round trips for session, history, and state reads/writes.
- No per-process retriever/vector-store cache is implemented yet.
- No response streaming is implemented yet.
- No short-circuit cache for deterministic curriculum/lesson metadata responses.
- Conversation tests needed `RAG_EXTRACTIVE_ONLY=true` to avoid LLM latency/flakiness.

## Later Optimization Ideas

- Cache loaded vector store in memory for the backend process.
- Cache curriculum/study map reads where safe.
- Reuse embedding and vector-store clients instead of recreating them per request.
- Add timing logs around:
  - MongoDB session/state/history calls
  - vector-store load
  - query embedding
  - retrieval/reranking
  - LLM answer generation
  - lesson generation
- Add request-level latency metadata in development mode.
- Consider streaming LLM responses to frontend.
- Keep deterministic metadata and clarification paths free of RAG/LLM calls.
- Evaluate a production vector DB later for faster startup and scalable retrieval.
- Consider a small cache for repeated lesson topic retrieval.

## Acceptance Criteria Later

- Typical metadata/clarification turn responds in under 1 second locally.
- Typical grounded RAG answer responds in an acceptable product target after measurement.
- Lesson start/continue latency is measured and improved.
- Timing logs make the slow stage visible without guessing.
- QA conversation can complete in real LLM mode without timing out.

## Notes

- This is intentionally a backlog task.
- Do not change the RAG grounding rule to make things faster.
- Do not remove source attribution.
- Do not add a production vector DB until local behavior and product flow are stable.
