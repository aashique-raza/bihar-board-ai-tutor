# Coding Standards

These standards apply when implementation begins. This document does not define current application code.

## General Principles

- Keep the first implementation small.
- Prefer clear code over clever abstractions.
- Make each pipeline stage testable.
- Preserve source metadata throughout the flow.
- Keep configuration explicit.

## Project Boundaries

For the first milestone:

- No frontend.
- No database.
- No auth.
- No admin panel.
- No analytics.
- No quiz.

## Module Shape

When code is added later, keep these responsibilities separate:

- Loading source documents.
- Cleaning text.
- Chunking text.
- Creating embeddings.
- Storing and searching vectors.
- Building prompts.
- Calling the answer model.
- Formatting API responses.

## Data Handling

- Never drop source metadata from chunks.
- Keep raw content separate from processed content.
- Make indexing repeatable.
- Avoid manual edits to generated indexes.

## RAG Safety

- The answer generator should receive only retrieved context.
- The API should expose sources with every answer.
- Unsupported questions should produce a safe refusal.
- Tests should cover both answerable and unanswerable questions.

## Language Handling

- Preserve Hindi source content.
- Accept Hindi, Hinglish, and simple English questions.
- Return final student answer in simple Hinglish.
- Avoid unnecessary translation of source text before indexing.

## Testing Expectations

Start with focused tests:

- Loader reads expected files.
- Cleaner preserves important Hindi and Science terms.
- Chunker attaches metadata.
- Retriever returns expected chapter chunks for known questions.
- Generator refuses when context is insufficient.
- API response includes answer and sources.

## Logging

Useful logs for early development:

- Number of documents loaded.
- Number of chunks created.
- Embedding/index creation status.
- Retrieved chunk ids and scores.
- Whether the answer was generated or refused.

Do not log private user data beyond what is needed for local development.
