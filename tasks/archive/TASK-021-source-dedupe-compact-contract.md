# TASK-021: Source Dedupe and Compact Backend Source Contract

Status: DONE

## Goal

Make RAG and lesson sources cleaner, stable, and easier for the frontend to display without parsing raw heading paths.

## Scope

- Deduplicate repeated sources from the same chapter/topic heading.
- Keep source order stable based on retrieval order.
- Return compact display fields in API responses.
- Preserve compatibility fields used by the current frontend and stored chat history.
- Keep source attribution in every grounded output.

## Completed

- Updated source formatting to deduplicate sources by chapter and heading path.
- Added compact source fields:
  - `sourceId`
  - `label`
  - `sourceTitle`
  - `chapterTitle`
  - `topicTitle`
  - `sectionTitle`
  - `chunkIds`
- Preserved compatibility fields:
  - `sourceNumber`
  - `section`
  - `headingPath`
  - `chunkId`
- Updated doubt answer API formatting to preserve compact source fields.
- Updated lesson source output through the shared formatter.
- Updated follow-up context extraction to prefer `topicTitle` when available.
- Updated frontend source chips to prefer `label` / `sourceTitle`.
- Strengthened conversation and lesson regression tests to require compact, deduplicated source shape.

## Verified

- `npm.cmd run test:lesson-flow` passed.
- `npm.cmd run test:tutor-conversations` passed.
- `npm.cmd run test:ask-db` passed.
- `npm.cmd run test:chat-db-models` passed.
- Frontend `npm.cmd run build` passed.
- Manual source payload QA confirmed compact source fields are returned.

## Notes

- Sources remain grounded in retrieved chunks.
- Dedupe does not remove attribution; merged chunks are retained in `chunkIds`.
- Frontend can now display a clean `label` instead of raw `chapterTitle / headingPath`.
