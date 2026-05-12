# AGENTS.md

## Project

Bihar Board Class 10 Science AI Tutor.

## Current Scope

Build planning, context, and a thin backend-first RAG pipeline for Class 10 Science.

Do not build the frontend yet.  
Do not set up a database yet.  
Do not expand beyond 2 chapters for the first milestone.

## Product Goal

Help Bihar Board Class 10 students ask Science questions in Hindi or Hinglish and receive simple Hinglish answers that are grounded only in approved study content.

Core flow:

```text
Study content -> prepare/index -> vector search -> grounded AI answer -> Hinglish answer with sources
```

## Non-Negotiable Rules

- Answer only from retrieved source content.
- Do not hallucinate.
- If the retrieved content is insufficient, say that the available material does not contain the answer.
- Final student-facing answer must be simple Hinglish.
- User questions may be Hindi, Hinglish, or simple English.
- Source content may be Hindi.
- Start with Class 10 Science only.
- Start with 2 chapters only.
- Keep first milestone thin and testable.

## Agent Working Rules

- Do not write application code unless the user asks for implementation.
- Prefer small, documented steps.
- Keep architecture practical and easy to replace later.
- Do not introduce frontend, admin panel, analytics, quiz, auth, or database work in the first milestone.
- Treat this as an education product, not a generic chatbot.
- Always preserve source attribution in RAG outputs.
- Bias toward correctness, traceability, and simple language over cleverness.

## Suggested First Milestone

Create a minimal backend pipeline that can:

1. Load 2 chapters of Class 10 Science content.
2. Clean and chunk the text.
3. Create embeddings.
4. Store chunks in a local vector store.
5. Retrieve relevant chunks for a question.
6. Generate a simple Hinglish answer grounded only in retrieved chunks.
7. Return answer plus sources from one API endpoint.

## Documentation Map

- `README.md`: Project overview and quick orientation.
- `TASKS.md`: Work breakdown by milestone.
- `DECISIONS.md`: Architecture and product decisions.
- `docs/00-project-brief.md`: Product brief and constraints.
- `docs/01-architecture.md`: System architecture.
- `docs/02-build-roadmap.md`: Build sequence.
- `docs/03-data-strategy.md`: Source content and processing approach.
- `docs/04-rag-rules.md`: Retrieval and generation rules.
- `docs/05-coding-standards.md`: Implementation standards for later coding.
- `docs/06-api-contract.md`: Planned API contract.
