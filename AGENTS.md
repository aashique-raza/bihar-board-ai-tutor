# AGENTS.md

## Project

Bihar Board Class 10 Science AI Tutor.

This project is an education-focused RAG system. It should help Bihar Board Class 10 students ask Science questions in Hindi, Hinglish, or simple English and receive simple Hinglish answers grounded only in approved study content.

## Current Phase

Planning and context setup.

Do not write application code until the user asks for implementation.

## Core Product Rule

The tutor must answer only from retrieved/indexed source content. If the available retrieved content is not enough to answer, it must clearly say that the available material does not contain the answer.

## Working Rules for Codex

- Always read the project documentation before coding.
- Work on one task at a time.
- Do not overbuild.
- Do not add a database until explicitly asked.
- Do not add a frontend until explicitly asked.
- Do not add an admin panel until explicitly asked.
- Do not add analytics, quizzes, auth, or chat history until explicitly asked.
- Do not install packages without a clear reason.
- Do not add LangChain or any RAG framework until the implementation step calls for it.
- Do not change the documented architecture without permission.
- Keep the first milestone thin, backend-first, and testable.
- Prefer a clean, simple Node.js project structure when implementation begins.
- Keep source attribution in every RAG output.
- Keep final student-facing answers in simple Hinglish.
- Do not hardcode chapter names until verified source selection is complete.
- Every code file later should include clear comments where they help explain intent.

## First Milestone Boundary

The first milestone proves this flow only:

```text
Study Content
-> Data Loader
-> Text Cleaner
-> Chunker
-> Metadata Builder
-> Embedding Generator
-> Local Vector Store
-> Retriever
-> Grounded Prompt Builder
-> LLM Answer Generator
-> Hinglish Answer with Sources
```

The first milestone uses only 2 verified Class 10 Science chapters. The chapter names are still TBD and must not be hardcoded before source verification.

## After Each Task

At the end of each task, report:

- Files changed.
- Commands to run.
- What was verified.
- The next recommended step.
