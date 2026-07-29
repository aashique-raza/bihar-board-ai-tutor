# TASK-016: Grounded Lesson Generation from Retrieved Topic Context

## Status

DONE

## Why This Task Exists

The lesson flow could already start a chapter and move to the next topic, but the lesson answer was still placeholder text.

Zuno now needs to teach the selected topic from approved indexed content only.

## Goal

Generate lesson text from retrieved chapter/topic context and return sources with the lesson response.

## Scope

Added:

- Topic-based lesson search query.
- Chapter-scoped retrieval for lesson topics.
- Grounded lesson prompt.
- LangChain lesson chain.
- Extractive fallback when the model call fails after retrieval.
- Lesson sources in `lesson_started` and `lesson_continued` responses.
- Regression test checks for grounded sources and no old placeholder text.

Not added:

- LangChain structured planner.
- Quiz/check-answer flow.
- Frontend lesson state UI.
- Production vector database.

## Current Implementation Status

- `backend/src/services/lessonGeneration.service.js` generates lesson content for one chapter/topic.
- `backend/src/rag/query/prompts/lessonPrompt.js` keeps lesson answers grounded in retrieved context.
- `backend/src/rag/query/chains/lessonChain.js` wires the lesson prompt to the configured chat model.
- `backend/src/services/lessonFlow.service.js` now calls grounded lesson generation for start and next flows.
- `backend/src/services/ask.service.js` saves lesson sources in session context.
- `backend/scripts/test-lesson-flow.js` verifies sources and guards against old placeholder output.

## Verification Commands

From `backend/`:

```bash
npm.cmd run test:lesson-flow
npm.cmd run test:ask-db
```

Latest verification:

```text
test:lesson-flow: passed
test:ask-db: passed
```

## Next Step After This Task

Improve the frontend lesson experience:

- show current lesson topic,
- make the next-topic action easy to click,
- display lesson sources compactly.
