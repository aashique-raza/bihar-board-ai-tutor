# TASKS.md

## Milestone 0: Planning Context

- [x] Create project planning files.
- [x] Define scope and constraints.
- [x] Define architecture stages.
- [x] Define RAG behavior rules.
- [x] Define first API contract.

## Milestone 1: Thin Working RAG Pipeline

Goal: prove the full backend flow with 2 chapters and no frontend.

- [ ] Choose the first 2 Class 10 Science chapters.
- [ ] Collect source content for those chapters.
- [ ] Store raw source files in a clear local folder.
- [ ] Add metadata for each source: chapter, section, language, page or paragraph reference.
- [ ] Implement a data loader.
- [ ] Implement text cleaning for Hindi and mixed Hindi-English text.
- [ ] Implement chunking with source metadata.
- [ ] Generate embeddings for chunks.
- [ ] Store vectors in a simple local vector store.
- [ ] Build a retriever that returns top relevant chunks.
- [ ] Build grounded answer generation with strict source-only behavior.
- [ ] Return simple Hinglish answer with sources.
- [ ] Add one question-answer API endpoint.
- [ ] Add basic tests for retrieval and grounded answer behavior.

## Milestone 2: Reliability Improvements

- [ ] Add test questions for each chapter.
- [ ] Add "insufficient content" test cases.
- [ ] Add source citation checks.
- [ ] Add logging for retrieval scores and selected chunks.
- [ ] Add configurable chunk size and top-k retrieval.
- [ ] Add simple evaluation notes for answer quality.

## Milestone 3: Frontend

Not part of the first milestone.

- [ ] Student question input.
- [ ] Answer display.
- [ ] Source display.
- [ ] Loading and error states.
- [ ] Mobile-friendly layout.

## Milestone 4: Admin Panel

Not part of the first milestone.

- [ ] Upload or manage chapter content.
- [ ] Re-index content.
- [ ] View indexed chunks.
- [ ] Check failed or low-confidence answers.

## Milestone 5: Analytics and Quiz

Not part of the first milestone.

- [ ] Track common question topics.
- [ ] Track unanswered questions.
- [ ] Generate simple practice questions from approved content.
- [ ] Add chapter-wise quiz mode.
- [ ] Add weak-topic recommendations.
