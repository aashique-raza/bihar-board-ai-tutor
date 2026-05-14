# TASKS.md

## Project

Bihar Board Class 10 Science AI Tutor

## Current Direction

The project will use curated English Markdown files as the primary knowledge source for RAG.

Hindi PDFs are reference material only.

The app should not depend on raw PDF parsing quality for production RAG content.

## Current Active Task

TASK-003: Curated Content Loader

Task file:
tasks/TASK-003-curated-content-loader.md

## Completed Tasks

### TASK-001: Minimal Backend Foundation

Status: DONE

Task file:
tasks/TASK-001-minimal-backend-foundation.md

Completed:
- Created minimal backend folder structure.
- Added health route.
- Added basic Express app/server setup.
- Added config, middleware, utils, and route structure.
- Backend runs successfully.

### TASK-002: Curated Content Foundation

Status: DONE

Task file:
tasks/TASK-002-curated-content-foundation.md

Completed:
- Confirmed curated Markdown content path.
- Established curated English Markdown as the primary RAG source.
- Kept Hindi PDFs as reference material only.
- Confirmed no embeddings, chunking, vector DB, or RAG were added.

## Staged Project Roadmap

### Stage 0: Documentation and Project Control

Status: DONE

Goal:
Create project control documents so development stays owner-controlled and Codex does not randomly change direction.

Completed:
- AGENTS.md
- README.md
- DECISIONS.md
- TASKS.md
- tasks/ folder

### Stage 1: Minimal Backend Foundation

Status: DONE

Goal:
Create only the basic backend foundation.

Completed:
- backend/
- backend/src/
- health API
- env setup
- error handling foundation
- response helper foundation

### Stage 2: Curated Content Foundation

Status: DONE

Goal:
Set up clean curated Markdown content as the real knowledge source.

Current content:
- data/curated/science/class-10/chapter-01.md

Rules:
- Hindi PDFs are reference only.
- Curated English Markdown is the real RAG source.
- No raw PDF parsing dependency for MVP.
- No embeddings yet.
- No chunking yet.
- No vector DB yet.

Acceptance Criteria:
- data/curated/science/class-10/chapter-01.md exists.
- File has clean Markdown structure.
- File has frontmatter metadata.
- Content is readable.
- Content is suitable for chunking.
- No PDF cleanup scripts are required for the MVP path.

### Stage 3: Curated Content Loader

Status: IN PROGRESS

Goal:
Load curated Markdown files from data/curated.

Expected work:
- Create content loader.
- Read .md files recursively.
- Extract metadata from frontmatter.
- Extract metadata from file path.
- Print loaded document preview.

No embeddings in this stage.

### Stage 4: Chunking Strategy

Status: NOT STARTED

Goal:
Split curated Markdown into clean RAG-friendly chunks.

Expected work:
- Split by headings.
- Preserve equations.
- Preserve Q&A blocks.
- Preserve chapter/section metadata.
- Test chunk size.
- Print chunk preview.

No embeddings in this stage.

### Stage 5: Embeddings and Vector Store

Status: NOT STARTED

Goal:
Convert chunks into embeddings and store them.

Expected work:
- Choose embedding model.
- Create embeddings service.
- Store vectors.
- Save metadata.
- Avoid duplicate embeddings.
- Add local persistence first.

### Stage 6: Retrieval Pipeline

Status: NOT STARTED

Goal:
Search relevant chunks for a student question.

Expected work:
- Similarity search.
- topK control.
- minScore control.
- Metadata filtering by class, subject, chapter.
- Retrieval debug output.

### Stage 7: Grounded Answer Generation

Status: NOT STARTED

Goal:
Generate answer only from retrieved content.

Expected work:
- RAG prompt.
- Source-grounded answer.
- Fallback when context is insufficient.
- Simple English/Hinglish answer style.
- No hallucination.

### Stage 8: Backend API Integration

Status: NOT STARTED

Goal:
Expose tutor functionality through backend API.

Expected work:
- Ask question endpoint.
- Chapter filter support.
- Request validation.
- Error handling.
- Response format.

### Stage 9: Evaluation and Quality Testing

Status: NOT STARTED

Goal:
Test if answers are accurate and exam-useful.

Expected work:
- Prepare test questions.
- Check retrieval quality.
- Check answer quality.
- Track failure cases.
- Improve content/chunking if needed.

### Stage 10: Minimal Frontend Demo

Status: NOT STARTED

Goal:
Create a simple student-facing chat UI.

Expected work:
- React frontend.
- Ask question box.
- Chapter selector.
- Answer display.
- Source display.

### Stage 11: Deployment Demo

Status: NOT STARTED

Goal:
Deploy project as portfolio/demo.

Expected work:
- Frontend deployment.
- Backend deployment.
- Env setup.
- Basic usage limit.
- README update.

## Development Rules

- Work on only one task at a time.
- Do not start the next task without owner approval.
- Do not modify unrelated files.
- Do not build ahead.
- Do not add auth, database, admin panel, quiz, frontend, vector DB, or embeddings unless the current task explicitly asks.
- Keep backend separate from content preparation.
- Keep curated content in data/curated.
- Commit curated content.
- Do not commit raw PDFs unless explicitly approved.

## Next Task Rule

After TASK-002 is complete, wait for owner approval before starting TASK-003.
