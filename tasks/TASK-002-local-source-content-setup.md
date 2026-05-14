# TASK-002: Local Source Content Folder Setup

Status: TODO

## Goal

Create the local source content folder structure and metadata tracking format for the first 2 verified Class 10 Science chapters.

This task prepares the data/content foundation only. It must not add fake or unverified study content.

## Context

The project needs trusted Bihar Board Class 10 Science content for RAG.

The first milestone will use only 2 verified chapters.

Chapter names are still TBD until source selection is complete.

## Allowed Changes

- Create a local content/data folder structure.
- Create a source metadata template.
- Create a README explaining how content files should be added.
- Prepare the project for adding 2 verified chapter text files later.

## Forbidden Changes

- Do not write fake educational content.
- Do not create unverified chapter notes.
- Do not scrape copyrighted content.
- Do not add embeddings.
- Do not add vector store.
- Do not add loader logic.
- Do not add cleaner logic.
- Do not add RAG logic.
- Do not modify backend server code.
- Do not modify API routes.

## Expected Folder Structure

```text
data/
  source-content/
    README.md
    sources.metadata.json
    class-10/
      science/
        .gitkeep
```

## Metadata Format

`sources.metadata.json` should support this structure:

```json
[
  {
    "id": "source-001",
    "classLevel": "10",
    "subject": "Science",
    "chapterName": "TBD",
    "chapterNumber": "TBD",
    "sourceType": "manual-notes | official-syllabus | model-paper | teacher-reviewed-notes",
    "sourceName": "TBD",
    "sourceUrl": "TBD",
    "language": "Hindi | English | Hinglish",
    "verificationStatus": "pending | verified | rejected",
    "addedBy": "developer",
    "notes": "TBD"
  }
]
```

## Acceptance Criteria

- `data/source-content/` folder exists.
- `data/source-content/README.md` exists.
- `data/source-content/sources.metadata.json` exists.
- `data/source-content/class-10/science/.gitkeep` exists.
- No fake chapter content is added.
- No backend code is changed.
- No RAG code is added.

## Test Plan

Manual check:
- Confirm folder structure exists.
- Confirm metadata JSON is valid.
- Confirm no unverified educational content was added.
- Confirm backend code was not changed.

## Completion Report Required

After implementation later, Codex must report:
- Files created
- Files changed
- Whether any content was added
- How metadata should be filled
- Any assumptions made
