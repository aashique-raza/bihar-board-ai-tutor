# Build Roadmap

## Phase 0: Planning

Create project context files and align on the first milestone.

Output:

- Clear scope.
- RAG rules.
- Architecture stages.
- API contract.
- Task list.

## Phase 1: Thin RAG Pipeline

This is the first implementation phase.

Build only what is needed to prove the full backend flow:

1. Minimal backend project setup.
2. Load 2 chapters of Class 10 Science content.
3. Clean text.
4. Chunk text with metadata.
5. Create embeddings.
6. Store vectors locally.
7. Retrieve relevant chunks.
8. Generate simple Hinglish answer from retrieved chunks.
9. Return answer and sources from one API endpoint.

Exit criteria:

- One local command can index the 2 chapters.
- One API request can ask a question.
- The answer includes sources.
- Unsupported questions produce a safe refusal.

## Phase 2: Evaluation and Reliability

Improve confidence before adding UI.

Tasks:

- Add chapter-wise test questions.
- Add tests for missing-content questions.
- Inspect retrieved chunks for sample questions.
- Tune chunk size and top-k retrieval.
- Add logging for retrieval results.

## Phase 3: Frontend

Build the student-facing UI after backend behavior is stable.

Minimum UI:

- Question input.
- Answer display.
- Source list.
- Error and loading states.
- Mobile-friendly layout.

## Phase 4: Admin Panel

Add content management only after the first RAG flow is useful.

Possible features:

- Upload source files.
- Rebuild index.
- View chunks.
- Review bad answers.

## Phase 5: Analytics and Quiz

Add learning features after the tutor can answer reliably.

Possible features:

- Track common doubts.
- Track questions with insufficient answers.
- Generate chapter practice questions.
- Quiz mode.
- Weak-topic summary.
