# Bihar Board Class 10 Science AI Tutor

An AI tutor for Bihar Board Class 10 Science students.

The tutor should answer student questions in simple Hinglish, using only approved study content. The first version is intentionally narrow: Class 10 Science, 2 chapters, and a thin working RAG pipeline.

## Core Flow

```text
Study content
-> prepare/index
-> vector search
-> grounded AI answer
-> simple Hinglish answer with sources
```

## First Milestone

Build a minimal backend RAG pipeline:

1. Load source content for 2 Science chapters.
2. Clean the text.
3. Split content into searchable chunks.
4. Generate embeddings.
5. Store chunks in a local vector store.
6. Retrieve relevant content for a student question.
7. Generate a grounded Hinglish answer.
8. Expose one API endpoint for question answering.

## Current Constraints

- Start with Class 10 Science only.
- Start with 2 chapters only.
- Source content can be Hindi.
- Questions can be Hindi, Hinglish, or English.
- Final answer must be simple Hinglish.
- Do not hallucinate.
- Answer only from retrieved content.
- Include sources with answers.
- Do not build frontend yet.
- Do not set up database yet.

## Planned Architecture Stages

1. Minimal backend setup
2. Data loading
3. Text cleaning
4. Chunking
5. Embeddings
6. Vector store
7. Retriever
8. Grounded Hinglish answer generation
9. API endpoint
10. Frontend
11. Admin panel
12. Analytics/quiz

## Documentation

- `AGENTS.md` - Instructions for AI agents working on this project.
- `TASKS.md` - Milestone task list.
- `DECISIONS.md` - Product and technical decisions.
- `docs/00-project-brief.md` - Product brief.
- `docs/01-architecture.md` - System architecture.
- `docs/02-build-roadmap.md` - Build roadmap.
- `docs/03-data-strategy.md` - Data and content strategy.
- `docs/04-rag-rules.md` - RAG behavior rules.
- `docs/05-coding-standards.md` - Future coding standards.
- `docs/06-api-contract.md` - Planned API contract.

## Success Definition

The first useful version is not a polished app. It is a working backend flow where a student asks a question and receives:

- A simple Hinglish answer.
- Grounding from retrieved chapter content.
- Clear source references.
- A refusal when the answer is not present in the content.
