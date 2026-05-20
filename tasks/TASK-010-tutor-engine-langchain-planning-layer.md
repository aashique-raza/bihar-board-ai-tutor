# TASK-010: LangChain-First Tutor Engine Planning Layer

## Status

DONE for architecture, Curriculum Brain, and resolver foundation.

Current completed parts:

- Part 1: Architecture documentation.
- Part 2: Curriculum Brain Foundation.
- Part 3: Chapter/Topic Resolver Foundation.
- DB-backed state was completed later in TASK-011 through TASK-014.
- Lesson start/continue and grounded lesson generation were completed later in TASK-015 and TASK-016.

Current next core part:

- LangChain Planner and Action Executor Foundation.

Status note:

- This task is no longer paused.
- The original in-memory Tutor State plan has been replaced by MongoDB-backed `chat_states`.
- The remaining Tutor Engine work should be split into a new implementation task instead of expanding this planning task forever.

## Why This Task Exists

The current project has a working RAG pipeline, but Zuno still behaves like a question-answer bot rather than a real tutor.

Recent testing showed that manual routing and small intent patches are not enough for natural tutoring flows:

```text
physics chapter 3 padhao
global mode me hi padhao
start kro ek ek krke
in chapters me sabse tough kaun sa hai
```

The correct next step is a LangChain-first Tutor Engine that uses curriculum structure, tutor state, a structured LLM planner, action execution, and RAG/lesson-generation chains.

## Goal

Build the foundation for:

```text
Curriculum Brain
-> Tutor State
-> LangChain Planner
-> Action Executor
-> RAG / Lesson Chains
-> Structured Response
```

This should be designed for future subjects:

- Science
- Math
- Hindi
- English
- Social Science
- Urdu
- Sanskrit

## Key Decision

Use LangChain wherever it provides real value:

- `ChatPromptTemplate` for planner and lesson prompts.
- Provider-based chat models from existing LLM config.
- LCEL `RunnableSequence` for planner and generator chains.
- Structured output parsing and validation for planner JSON.
- LangChain `Document` objects for curriculum/topic context when useful.
- Existing LangChain embeddings and `MemoryVectorStore` for grounded retrieval.

Avoid building a large manual if-else router. Deterministic code is allowed only for stable operations such as loading curriculum JSON, resolving IDs, validating plans, and executing known actions.

## Current Compatibility Layer

Existing files under:

```text
backend/src/tutor/router/
backend/src/tutor/handlers/
backend/src/tutor/context/
```

are temporary compatibility code. They are still required by the current `/api/v1/ask` flow and should not be deleted before Tutor Engine fully replaces them.

Cleanup will happen after:

- Tutor Engine handles the current regression conversations.
- `/api/v1/ask` is wired through the new planner/executor.
- Frontend works with the new structured response contract.

## Scope

### Part 1: Documentation

Create architecture doc:

```text
docs/tutor-engine-langchain-architecture.md
```

It must describe:

- Why routing patches are not enough.
- Curriculum Brain.
- Tutor State.
- LangChain Planner.
- Action Executor.
- Lesson Generator.
- Response contract.
- Cleanup plan for the temporary router.

### Part 2: Curriculum Brain Foundation

Create a structured curriculum index from existing curated Markdown.

Expected output:

```text
backend/storage/curriculum-index.json
```

Initial index should include:

- subject id/title
- section id/title
- chapter id/title/number
- topic id/title/order
- heading path
- source file path
- RAG hints

Use deterministic Markdown/frontmatter parsing first. Do not let LLM invent chapter/topic structure.

Current implementation status:

- `backend/src/tutor/curriculum/curriculumIndexBuilder.js` added.
- `backend/src/tutor/curriculum/curriculumIndexStore.js` added.
- `backend/scripts/build-curriculum-index.js` added.
- `npm.cmd run curriculum:build` added through `backend/package.json`.
- Local generated output exists at `backend/storage/curriculum-index.json`.
- The generated storage file is intentionally not tracked because `storage/` is ignored.

Current generated summary:

```text
subjects: 1
sections: 3
chapters: 16
topics: 1971
LangChain topic documents: 1971
```

The index preserves all important headings, and each topic has a role such as:

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

For lesson planning, `core` topics provide the main teaching path. Example: Physics chapter 3 `Electricity` currently has 13 core lesson topics.

### Part 3: Resolver Foundation

Add resolver modules:

```text
backend/src/tutor/curriculum/chapterResolver.js
backend/src/tutor/curriculum/topicResolver.js
```

They should support:

- `physics chapter 3`
- `physic ke chapter 3`
- `biology chapter 1`
- chapter title lookup such as `electricity`
- ambiguity detection

Current implementation status:

- `backend/src/tutor/curriculum/chapterResolver.js` added.
- `backend/src/tutor/curriculum/topicResolver.js` added.
- `backend/scripts/test-curriculum-resolvers.js` added.
- `npm.cmd run test:curriculum-resolvers` added through `backend/package.json`.
- Chapter resolver supports section + chapter number, typo-normalized section hints, title lookup, ordinal chapter words, and ambiguity detection.
- Topic resolver supports chapter-scoped topic lookup, global topic lookup, and chapter core topic extraction.
- Loader/chunker regression scripts were corrected to resolve the root `data/class-10/science` folder.

Current verified examples:

```text
physics chapter 3 padhao -> science.physics.chapter-03
physic ke chapter 3 -> science.physics.chapter-03
electricity start kro -> science.physics.chapter-03
biology ka first chapter -> science.biology.chapter-01
life processes padhao -> science.biology.chapter-01
chapter 3 padhao -> ambiguous
electric current padhao -> science.physics.chapter-03 topic
```

### Part 4: Tutor State Design

Original plan:

```text
backend/src/tutor/state/tutorStateSchema.js
backend/src/tutor/state/tutorStateStore.js
```

Current implementation:

- Tutor state is DB-backed through `backend/src/models/chatState.model.js`.
- State services live in `backend/src/services/chatState.service.js`.
- Ask API hydrates temporary session context from `chat_states`.

State tracks:

- current subject
- current section
- current chapter
- current topic
- learning mode
- preferred study mode
- pending action
- completed topics
- last planner action

### Part 5: LangChain Planner Foundation

Add planner files:

```text
backend/src/tutor/planner/plannerActions.js
backend/src/tutor/planner/plannerPrompt.js
backend/src/tutor/planner/plannerOutputParser.js
backend/src/tutor/planner/tutorPlanner.js
```

Planner must output one of:

```text
respond_smalltalk
set_learning_target
answer_metadata
start_lesson
continue_lesson
answer_doubt
give_study_advice
change_mode
ask_clarification
refuse_out_of_scope
```

Planner output must be JSON and validated before execution.

### Part 6: Action Executor Foundation

Add:

```text
backend/src/tutor/executor/actionExecutor.js
backend/src/tutor/actions/
```

Executor should call deterministic tools or LangChain chains depending on action:

- metadata -> curriculum index
- lesson -> lesson generation chain with RAG context
- doubt -> existing RAG answer chain
- clarification -> direct structured response

### Part 7: Conversation Regression Tests

Add:

```text
backend/scripts/test-tutor-conversations.js
```

Test conversations, not only isolated prompts.

Minimum conversations:

1. Greeting -> Biology target -> Biology chapter count -> tough chapter advice.
2. Physics chapter 3 -> important topics -> start lesson -> continue lesson.
3. Blood definition -> follow-up function question.
4. Focus mode out-of-chapter question.
5. Out-of-scope question.

## Acceptance Criteria

- Architecture doc exists and explains LangChain-first Tutor Engine.
- Task file exists and defines implementation steps.
- Existing temporary router is documented as temporary, not expanded as the long-term solution.
- Curriculum index design supports future subjects.
- Planner design uses LangChain structured output, not manual routing as the main decision engine.
- MongoDB-backed tutor state/history is implemented.
- Auth, admin, analytics, quiz, and production vector DB are still not added.

## Commands To Verify Later

From `backend/`:

```bash
npm.cmd run curriculum:build
npm.cmd run test:curriculum-resolvers
npm.cmd run test:loader
npm.cmd run test:chunks
npm.cmd run test:study-map
npm.cmd run test:tutor-conversations
npm.cmd run rag:query -- "electric current kya hota hai"
```

From `frontend/`:

```bash
npm.cmd run build
```

## Next Step After This Task

Start a new implementation task:

```text
Tutor Engine Planner and Action Executor Foundation
```

The planner/executor should use the existing Curriculum Brain, DB-backed state, RAG answer chain, and grounded lesson generation chain.
