# Coding Standards

## Current Note

No application code should be written until the user asks for implementation.

These standards guide later coding work.

## Project Style

- Prefer clean, simple Node.js structure.
- Keep modules small and focused.
- Keep the pipeline easy to replace later.
- Avoid unnecessary abstractions.
- Avoid framework lock-in during the first milestone.

## Implementation Boundaries

Do not add these until explicitly requested:

- Frontend.
- Database.
- Admin panel.
- Analytics.
- Quiz system.
- Auth.
- Chat history.
- LangChain code.

## Code Comments

Every code file later should have clear comments where comments help explain purpose or non-obvious logic.

Avoid noisy comments that repeat the code.

## RAG Code Expectations

Future RAG modules should keep these responsibilities separate:

- Loading.
- Cleaning.
- Chunking.
- Metadata building.
- Embedding.
- Local storage.
- Retrieval.
- Prompt building.
- Answer generation.
- API response formatting.

## Error Handling

Errors should be clear and actionable.

For student-facing answer generation:

- Missing content should produce an insufficient-context status.
- Failed processing should produce an error status.
- The system should not silently answer from outside knowledge.

## Configuration

Keep provider/model settings configurable later.

Do not hardcode:

- Chapter names before verification.
- API keys.
- Absolute local machine paths.
- Production storage assumptions.

## Testing Approach

Start with practical tests:

- Loader can read approved files.
- Cleaner preserves meaning.
- Chunker creates traceable chunks.
- Retriever returns relevant chunks.
- Generator refuses on insufficient context.
- API returns answer, sources, and status.
