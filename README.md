# Bihar Board AI Tutor

## Goal

Build a Bihar Board Class 10 Science AI Tutor that answers student questions using approved study content through Retrieval-Augmented Generation (RAG).

Students may ask questions in Hindi, Hinglish, or simple English. The final answer should be simple Hinglish and must be grounded only in retrieved/indexed source content.

## Current Status

Planning and context phase.

No application code has been added yet. The project direction is being documented before implementation starts.

## Initial Scope

- Class 10 Science only.
- First milestone uses only 2 verified chapters.
- Chapter names are not decided yet.
- Backend RAG pipeline first.
- Source content stored locally as clean text files first.
- Local vector store or JSON-based persisted store first.
- One API endpoint later for question answering.

## Architecture Summary

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

Student question flow:

```text
Student Question
-> API Endpoint
-> Query Processing
-> Vector Search
-> Relevant Chunks
-> Grounded Hinglish Prompt
-> LLM
-> Answer + Sources + Status
```

## First Milestone

Create a minimal backend pipeline that can:

1. Load 2 verified Class 10 Science chapter text files.
2. Clean and normalize text.
3. Chunk content with useful metadata.
4. Generate embeddings.
5. Persist chunks in a local vector store or JSON-based store.
6. Retrieve relevant chunks for a student question.
7. Generate a simple Hinglish answer grounded only in retrieved chunks.
8. Return answer, sources, and status from one API endpoint.

## Intentionally Not Included Yet

- Frontend.
- Database.
- Admin panel.
- Analytics.
- Quiz system.
- Authentication.
- Chat history.
- PDF/OCR pipeline.
- Hardcoded chapter names.
- LangChain implementation.
