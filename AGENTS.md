# AGENTS.md

## Project

Bihar Board Class 10 Science AI Tutor.

This project is an education-focused RAG system. It should help Bihar Board Class 10 students ask Science questions in Hindi, Hinglish, or simple English and receive simple Hinglish answers grounded only in approved study content.

## Current Phase

Core MVP implementation.

Application code may be written when the user explicitly asks for implementation. Keep changes scoped to the active task.

## Core Product Rule

The tutor must answer only from retrieved/indexed source content. If the available retrieved content is not enough to answer, it must clearly say that the available material does not contain the answer.

## Working Rules for Codex

- Always read the project documentation before coding.
- Work on one task at a time.
- Do not overbuild.
- MongoDB/Mongoose has already been added for chat sessions, chat history, and tutor state.
- A minimal React frontend has already been added.
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

The current curated Science set has 16 Markdown chapters across Physics, Chemistry, and Biology. Do not hardcode chapter lists in frontend/router logic; read available content from Study Map or Curriculum Brain.

## After Each Task

At the end of each task, report:

- Files changed.
- Commands to run.
- What was verified.
- The next recommended step.
