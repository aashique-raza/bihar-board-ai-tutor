# TASK-003: Curated Content Loader

## Status

IN PROGRESS

## Goal

Load curated English Markdown files from `data/curated` and print a local preview of document content and metadata.

## Scope

This task only creates a lightweight loader and preview command for curated Markdown content. It prepares the project to inspect curated documents before chunking, embeddings, retrieval, or answer generation.

## Allowed Work

- Create a curated Markdown loader.
- Read `.md` files recursively from `data/curated`.
- Parse simple frontmatter key-value metadata.
- Extract fallback metadata from file paths.
- Print document metadata and a content preview.
- Add a backend npm script for previewing curated content.
- Update `TASKS.md` to make TASK-003 the active task.

## Not Allowed Work

- Do not modify `backend/src` outside the loader/preview files required for this task.
- Do not build RAG.
- Do not create embeddings.
- Do not create a vector DB.
- Do not chunk content.
- Do not call an LLM.
- Do not create API routes.
- Do not create controllers.
- Do not create frontend, auth, database, admin, or quiz features.
- Do not modify unrelated files.

## Expected Files

- `backend/src/rag/loaders/curatedMarkdownLoader.js`
- `backend/src/rag/dev/previewCuratedContent.js`
- `backend/package.json`
- `TASKS.md`

## Implementation Steps

1. Create `backend/src/rag/loaders/curatedMarkdownLoader.js`.
2. Recursively find `.md` files under `data/curated`.
3. Parse simple frontmatter from each Markdown file.
4. Remove frontmatter from returned document content.
5. Infer fallback metadata from file path.
6. Let frontmatter metadata override fallback metadata.
7. Create `backend/src/rag/dev/previewCuratedContent.js`.
8. Add `rag:preview-content` script to `backend/package.json`.
9. Run the preview command from `backend/`.

## Acceptance Criteria

- `TASKS.md` shows TASK-003 as the current active task.
- This task file exists.
- `backend/src/rag/loaders/curatedMarkdownLoader.js` exists.
- `backend/src/rag/dev/previewCuratedContent.js` exists.
- `backend/package.json` has `rag:preview-content`.
- Running `npm run rag:preview-content` from `backend/` loads curated Markdown successfully.
- Output shows total documents loaded.
- Output shows metadata and readable content preview.
- No embeddings are added.
- No chunking is added.
- No vector DB is added.
- No API endpoint is added.
- No unrelated files are modified.

## Manual Test Command

Run from the backend folder:

```powershell
npm run rag:preview-content
```
