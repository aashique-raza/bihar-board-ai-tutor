# TASK-002: Curated Content Foundation

## Status

IN PROGRESS

## Goal

Set up curated English Markdown content as the real knowledge source for the Bihar Board Class 10 Science AI Tutor.

This replaces the earlier PDF-cleanup-first approach.

## Why This Task Exists

Raw Hindi PDFs can have extraction issues, broken text, footer noise, image references, and inconsistent formatting.

For MVP quality, the project will use clean curated English Markdown notes.

Hindi PDFs are reference material only.

## Input

Existing curated file:

data/curated/science/class-10/chapter-01.md

## Expected Output

A clean curated content foundation:

data/
  curated/
    science/
      class-10/
        chapter-01.md

## Requirements

1. Ensure the file exists:
   data/curated/science/class-10/chapter-01.md

2. Ensure the file name is exactly:
   chapter-01.md

3. Ensure the file contains frontmatter metadata:

---
class: 10
subject: Science
chapter: 1
chapter_title: Chemical Reactions and Equations
language: English
source_language: Hindi
board: Bihar Board
content_type: curated_notes
---

4. Ensure the content has clean Markdown headings.

5. Ensure the content is suitable for future chunking.

6. Do not create chunks in this task.

7. Do not create embeddings in this task.

8. Do not create vector DB in this task.

9. Do not modify backend/src.

10. Do not create API routes.

11. Do not create frontend.

## Validation Checklist

- [ ] File exists at data/curated/science/class-10/chapter-01.md
- [ ] File name is short and predictable.
- [ ] Frontmatter exists.
- [ ] Chapter title exists.
- [ ] Key concepts are present.
- [ ] Definitions are present.
- [ ] Important equations are present.
- [ ] Important questions are present.
- [ ] File is readable.
- [ ] No raw PDF extraction noise exists.
- [ ] No image markdown exists.
- [ ] No page footer/header noise exists.

## Forbidden Changes

- Do not modify backend/src.
- Do not build RAG.
- Do not create embeddings.
- Do not create vector DB.
- Do not chunk.
- Do not add auth.
- Do not add database.
- Do not add frontend.
- Do not add admin panel.
- Do not add quiz system.

## Acceptance Criteria

TASK-002 is complete only when:

- data/curated/science/class-10/chapter-01.md exists.
- It has required metadata.
- It has clean readable curated content.
- TASKS.md marks TASK-002 as DONE.
- No unrelated files are modified.

## Next Task

TASK-003: Curated Markdown Loader

Do not start TASK-003 without owner approval.
