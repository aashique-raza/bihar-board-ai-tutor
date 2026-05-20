# Curriculum Brain Foundation

## Purpose

This task creates the first structured Curriculum Brain for Zuno.

The RAG vector store is good for answering factual doubts, but tutor workflows also need curriculum structure:

```text
Subject -> Section -> Chapter -> Topic -> Teaching path
```

This lets later planner/executor work reliably understand requests such as:

```text
physics chapter 3 padhao
chapter 3 ke important topics kya hain
next topic start kro
```

## What Was Added

- `src/tutor/curriculum/curriculumIndexBuilder.js`
- `src/tutor/curriculum/curriculumIndexStore.js`
- `scripts/build-curriculum-index.js`
- `npm.cmd run curriculum:build`

The generated curriculum file is:

```text
backend/storage/curriculum-index.json
```

`storage/` is ignored, so the curriculum index is a generated local artifact like the vector store.

## LangChain Usage

This foundation reuses the existing LangChain Markdown loading pipeline:

```text
DirectoryLoader -> TextLoader -> normalized Markdown documents
```

It also converts curriculum topics into LangChain `Document` objects through `createCurriculumTopicDocuments`.

Those topic documents are not embedded yet. They are prepared so the upcoming Tutor Planner and chapter/topic resolvers can use curriculum context through LangChain-native primitives instead of ad hoc data shapes.

## Topic Roles

Every extracted heading is preserved as a topic and assigned a role:

```text
chapter
overview
core
subtopic
revision
practice
reference
support
```

For lesson planning, `core` topics form the main teaching path.

Example:

```text
Physics chapter 3: Electricity
core topics: 13
```

## Build Command

Run from `backend/`:

```bash
npm.cmd run curriculum:build
```

Expected summary:

```text
subjects: 1
sections: 3
chapters: 16
topics: 1971
LangChain topic documents: 1971
```

## Verification

The implementation was checked with:

```bash
node --check src/tutor/curriculum/curriculumIndexBuilder.js
node --check src/tutor/curriculum/curriculumIndexStore.js
node --check scripts/build-curriculum-index.js
npm.cmd run curriculum:build
```

The generated index validates before it is saved and again when it is loaded.

## Current Follow-Up

Chapter/Topic Resolver is now built on top of this index.

The resolver should map natural student requests to exact curriculum IDs:

```text
physic ke chapter 3 -> science.physics.chapter-03
electricity start kro -> science.physics.chapter-03
biology ka first chapter -> science.biology.chapter-01
```

Current next core step is the Tutor Engine planner/action executor foundation, using this Curriculum Brain plus DB-backed tutor state.
