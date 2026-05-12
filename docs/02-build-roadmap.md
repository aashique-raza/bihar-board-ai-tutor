# Build Roadmap

## Principle

Build the smallest backend-first RAG pipeline that proves grounded answering before adding product features.

## Stage 0: Documentation/context setup

Status: complete.

Outcome:

- Project direction documented.
- Milestone boundary documented.
- Non-goals documented.

## Stage 1: Minimal backend setup

Status: active next task.

Goal:

- Create the minimal backend structure only.
- Keep it simple and easy to replace.
- Avoid RAG implementation until the structure is approved.

Do not include:

- Frontend.
- Database.
- Admin.
- Analytics.
- Quiz.
- LangChain code.

## Stage 2: Source content setup

Goal:

- Add a local content folder.
- Add 2 verified Class 10 Science chapter text files.
- Keep chapter names TBD until sources are verified.
- Record source metadata.

## Stage 3: Loader

Goal:

- Load approved `.txt` files.
- Preserve file and source metadata.
- Fail clearly if expected source files are missing.

## Stage 4: Cleaner

Goal:

- Normalize text.
- Remove noise.
- Preserve Hindi meaning and educational structure.

## Stage 5: Chunker + metadata

Goal:

- Split content into searchable chunks.
- Attach source, chapter, section, and location metadata where available.
- Keep every chunk traceable.

## Stage 6: Embeddings

Goal:

- Generate embeddings for chunks.
- Keep embedding generation replaceable.
- Store model/provider details in metadata.

## Stage 7: Local vector store persistence

Goal:

- Persist chunks and vectors locally.
- Support rebuilding from source text.
- Avoid database setup.

## Stage 8: Retriever

Goal:

- Retrieve relevant chunks for a student question.
- Return source metadata.
- Detect weak or empty retrieval.

## Stage 9: Grounded Hinglish answer generator

Goal:

- Generate a simple Hinglish answer.
- Use only retrieved chunks.
- Refuse when retrieved content is insufficient.
- Include sources.

## Stage 10: API endpoint

Goal:

- Provide one backend endpoint for questions.
- Return answer, sources, and status.

## Stage 11: Evaluation/debugging

Goal:

- Test Hindi, Hinglish, and simple English questions.
- Test unsupported questions.
- Inspect retrieval and source attribution.

## Later Stages

Frontend, admin, database, quiz, analytics, auth, and chat history come later only after the thin backend RAG flow works.
