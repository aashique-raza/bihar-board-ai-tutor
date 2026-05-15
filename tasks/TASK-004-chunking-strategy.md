# TASK-004: Chunking Strategy

## Goal

Split curated Markdown documents into clean, RAG-friendly preview chunks.

## Scope

TASK-004 only chunks documents already loaded from `data/curated`. It does not create embeddings, retrieval, vector storage, answer generation, or API endpoints.

## Allowed Work

- Create a Markdown chunker.
- Use LangChain `MarkdownTextSplitter`.
- Preserve original document metadata.
- Add chunk-level metadata.
- Create a local chunk preview script.
- Add an npm script for previewing chunks.
- Update `TASKS.md` so TASK-004 is the only active task.

## Not Allowed Work

- Do not add embeddings.
- Do not add vector DB.
- Do not add retrieval.
- Do not add LLM calls.
- Do not add API endpoints.
- Do not add frontend.
- Do not add database.
- Do not add auth.
- Do not start TASK-005.
- Do not modify unrelated files.

## Strategy

Use Hybrid Markdown Chunking:

- Use curated Markdown structure.
- Prefer heading-aware chunking.
- Use LangChain splitter instead of a large custom splitter.
- Preserve useful heading text inside chunk content.
- Preserve original document metadata.
- Add chunk-level metadata.
- Keep chunk preview readable.

## Expected Files

- `backend/src/rag/chunkers/markdownChunker.js`
- `backend/src/rag/dev/previewChunks.js`
- `backend/package.json`
- `TASKS.md`

## Implementation Steps

1. Import `MarkdownTextSplitter` from `@langchain/textsplitters`.
2. Export `chunkMarkdownDocuments(documents, options = {})`.
3. Use default options `chunkSize: 1600` and `chunkOverlap: 150`.
4. Split loaded curated Markdown documents.
5. Preserve original metadata.
6. Add `chunkIndex`, `chunkType`, `sectionTitle`, `sectionLevel`, and `charCount`.
7. Create a chunk preview script.
8. Add `rag:preview-chunks` npm script.
9. Run the manual test command.

## Acceptance Criteria

- `TASKS.md` is updated correctly.
- This task file exists.
- `backend/src/rag/chunkers/markdownChunker.js` exists.
- `backend/src/rag/dev/previewChunks.js` exists.
- `backend/package.json` has `rag:preview-chunks`.
- `npm run rag:preview-chunks` runs successfully.
- Chunks include original metadata.
- Chunks include `chunkIndex`, `chunkType`, `sectionTitle`, `sectionLevel`, and `charCount`.
- No embeddings are added.
- No vector DB is added.
- No retrieval is added.
- No LLM call is added.
- No API endpoint is added.
- No frontend is added.
- TASK-005 is not started.

## Manual Test Command

Run from the backend folder:

```powershell
npm run rag:preview-chunks
```

## Multi-file Scalability Check

- The curated Markdown loader reads recursively from `data/curated`.
- The loader returns all `.md` files and sorts them by file path for stable output.
- The chunker works on the full documents array, not a single file.
- Each chunk preserves source metadata and includes per-document `chunkIndex` plus `globalChunkIndex`.
- Future chapters such as `chapter-02.md` or `chapter-03.md` need no code changes when added under `data/curated/{subject}/{classLevel}/`.
- Validation command:

```powershell
npm run rag:validate-content
```

- Multi-file smoke test command:

```powershell
npm run rag:smoke-multi-file
```

The smoke test creates temporary curated files and removes them in a `finally` block.
