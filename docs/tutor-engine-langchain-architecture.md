# Zuno Tutor Engine: LangChain-First Architecture

## Why This Architecture Is Needed

The current backend can answer grounded RAG questions, but a real tutor must do more than answer isolated doubts.

Students naturally say things like:

```text
aaj biology padhna hai
biology me kitne chapter hai
inme sabse tough kaun sa hai
physics chapter 3 padhao
global mode me hi padhao
start kro ek ek krke
```

These are not all simple RAG questions. Some are curriculum navigation, some are teaching commands, some are study guidance, and some are follow-ups that depend on session state.

The reliable solution is not to keep adding manual rules. Zuno needs a LangChain-first Tutor Engine:

```text
User Message
-> Tutor State
-> Curriculum Context
-> LangChain Planner
-> Action Executor
-> LangChain RAG / Teaching Chains
-> Updated Tutor State
-> Structured API Response
```

## Core Design Principle

RAG is one tool inside the tutor system. It is not the whole tutor.

The Tutor Engine decides what should happen next. LangChain should be used wherever it gives us structured orchestration, prompts, tools, runnable chains, output parsing, and later graph-style flows.

## Current Implementation Snapshot

Implemented now:

- Curriculum Brain from curated Markdown.
- Chapter and topic resolvers.
- MongoDB-backed `chat_sessions`, `chat_history`, and `chat_states`.
- Temporary rule/hybrid router and handlers.
- Deterministic lesson start/continue flow.
- Grounded lesson generation chain from retrieved topic context.
- React frontend foundation with session persistence.

Still missing:

- LangChain structured planner.
- Action executor module.
- Conversation-level regression test suite.
- Frontend rendering for structured Tutor Engine actions.

## Layers

### 1. Curriculum Brain

Purpose:
- Give Zuno structured knowledge of subjects, sections, chapters, and topics.
- Support future subjects such as Math, Hindi, English, Social Science, Urdu, and Sanskrit.
- Avoid relying on vector search for curriculum navigation.

Current source:
- Curated Markdown content in `data/`.

Generated output:

```text
backend/storage/curriculum-index.json
```

Target shape:

```json
{
  "subjects": [
    {
      "subjectId": "science",
      "title": "Science",
      "sections": [
        {
          "sectionId": "physics",
          "title": "Physics",
          "chapters": [
            {
              "chapterId": "science.physics.chapter-03",
              "number": 3,
              "title": "Electricity",
              "topics": [
                {
                  "topicId": "science.physics.chapter-03.topic-01",
                  "title": "Electric Current",
                  "order": 1,
                  "headingPath": "Chapter 3: Electricity > Electric Current",
                  "ragHints": ["electric current", "flow of charge"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

LangChain usage:
- Convert topic records into LangChain `Document` objects when needed.
- Optionally create a small curriculum vector store later for semantic chapter/topic resolution.
- Use `RunnableSequence` for curriculum index generation validation if LLM extraction is needed later.

First implementation:
- Deterministically extract chapter/topic structure from Markdown headings.
- Do not use an LLM to invent curriculum structure.

### 2. Tutor State

Purpose:
- Remember what the student is currently studying.
- Keep teaching flow stable across messages.

State shape:

```json
{
  "sessionId": "abc",
  "currentSubjectId": "science",
  "currentSectionId": "physics",
  "currentChapterId": "science.physics.chapter-03",
  "currentTopicId": "science.physics.chapter-03.topic-01",
  "learningMode": "teaching",
  "preferredStudyMode": "global",
  "pendingAction": "continue_lesson",
  "completedTopicIds": [],
  "lastStudentMessage": "start kro",
  "lastTutorAction": "start_lesson"
}
```

Storage:
- MongoDB Atlas through Mongoose.
- Current collections are `chat_sessions`, `chat_history`, and `chat_states`.
- Keep the state access behind services so planner/executor code does not depend directly on Mongoose model details.

LangChain usage:
- State is injected into planner prompt as structured context.
- Later, LangGraph can manage state transitions if the project moves beyond simple LCEL chains.

### 3. LangChain Tutor Planner

Purpose:
- Decide the next action using the user message, tutor state, curriculum context, and available tools.
- Replace fragile intent-routing loops with a structured planning step.

Planner input:

```json
{
  "message": "physics chapter 3 padhao",
  "normalizedMessage": "physics chapter 3 padhao",
  "tutorState": {},
  "curriculumContext": {},
  "availableActions": []
}
```

Planner output:

```json
{
  "action": "start_lesson",
  "confidence": 0.9,
  "target": {
    "subjectId": "science",
    "sectionId": "physics",
    "chapterNumber": 3,
    "chapterId": "science.physics.chapter-03"
  },
  "needsRag": true,
  "ragQuery": "Electricity chapter introduction and electric current",
  "clarificationQuestion": null,
  "reason": "Student wants to start Physics chapter 3."
}
```

Stable planner actions:

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

LangChain usage:
- `ChatPromptTemplate` for planner prompt.
- Provider-based `ChatModel` from existing LLM config.
- Structured JSON output through a parser.
- `RunnableSequence` for:

```text
plannerPrompt -> chatModel -> outputParser -> schema validation
```

Important rule:
- Planner does not write final student-facing answers.
- Planner only returns a validated action plan.

### 4. Action Executor

Purpose:
- Execute the planner action with deterministic code and LangChain chains.

Examples:

```text
start_lesson
-> resolve chapter
-> choose first topic
-> retrieve topic context
-> run lesson generation chain
-> update state
```

```text
answer_metadata
-> use curriculum index
-> return deterministic chapter/topic answer
```

```text
answer_doubt
-> run existing RAG answer chain
-> update last topic/source state
```

LangChain usage:
- Existing RAG chain for grounded doubt answers.
- New lesson generation chain for teaching.
- Tool-style functions can wrap deterministic operations:
  - `resolveChapter`
  - `getChapterTopics`
  - `getNextTopic`
  - `retrieveGroundedContext`

First implementation:
- Use a normal action executor module.
- Keep action functions small and testable.
- Do not add LangGraph yet unless LCEL becomes hard to manage.

### 5. Lesson Generator

Purpose:
- Generate teaching responses, not just answers.

Lesson response should:
- Use simple Hinglish.
- Teach one concept at a time.
- Include examples or check questions only when the retrieved context supports them.
- Stay grounded in retrieved chapter/topic content.

LangChain flow:

```text
topicContext
-> ChatPromptTemplate
-> ChatModel
-> StringOutputParser
```

Lesson output example:

```text
Chalo Electricity ka first topic start karte hain: Electric Current.

Simple meaning:
Electric current ka matlab hai charge ka flow.

Example:
Jaise pipe me water flow karta hai, waise wire me charge flow karta hai.

Quick check:
Current ka SI unit kya hota hai?
```

### 6. Response Contract

The frontend should not parse natural language. Backend response must be structured.

Example:

```json
{
  "status": "lesson_started",
  "action": "start_lesson",
  "answer": "...",
  "lesson": {
    "chapterId": "science.physics.chapter-03",
    "chapterTitle": "Electricity",
    "topicId": "science.physics.chapter-03.topic-01",
    "topicTitle": "Electric Current",
    "nextAction": "continue_lesson"
  },
  "suggestedActions": [
    { "type": "continue_lesson", "label": "Next topic" },
    { "type": "ask_doubt", "label": "Ask doubt" }
  ],
  "sources": []
}
```

## Relationship To Current Router

Current files under `backend/src/tutor/router`, `backend/src/tutor/handlers`, and `backend/src/tutor/context` are a temporary compatibility layer.

They fixed immediate UX issues, but they are not the final architecture.

Do not keep adding manual rules for every new student phrase. New learning workflows should move into:

```text
Tutor Planner -> Action Executor -> LangChain chains/tools
```

Cleanup rule:
- Keep current router until Tutor Engine fully replaces `/api/v1/ask`.
- After the new engine passes conversation regression tests, remove or collapse the old rule-router files.

## Target Folder Structure

```text
backend/src/tutor/
  curriculum/
    curriculumIndexBuilder.js
    curriculumIndexStore.js
    chapterResolver.js
    topicResolver.js

  state/
    tutorStateStore.js
    tutorStateSchema.js

  planner/
    plannerActions.js
    plannerPrompt.js
    tutorPlanner.js
    plannerOutputParser.js

  executor/
    actionExecutor.js

  actions/
    answerDoubt.js
    answerMetadata.js
    askClarification.js
    changeMode.js
    continueLesson.js
    giveStudyAdvice.js
    refuseOutOfScope.js
    respondSmalltalk.js
    setLearningTarget.js
    startLesson.js

  teaching/
    lessonPrompt.js
    lessonGenerator.js
```

## Implementation Order

1. Create curriculum index from Markdown headings. DONE.
2. Add chapter/topic resolver against the curriculum index. DONE.
3. Upgrade session context into DB-backed tutor state. DONE.
4. Add deterministic lesson start/continue flow. DONE.
5. Build grounded lesson generator chain. DONE.
6. Build LangChain planner with structured JSON output. NEXT.
7. Build action executor.
8. Route `/api/v1/ask` through Tutor Engine.
9. Update frontend to render lesson state and suggested actions.
10. Add conversation regression tests.
11. Remove temporary router/handler files after replacement is verified.

## Test Strategy

Single prompt tests are not enough. Use conversation tests.

Example:

```text
hii
aaj biology padhna hai
biology me kitne chapter hai
inme sabse tough kaun sa hai
life processes start kro
ek ek krke padhao
next
blood kya hai
```

Expected:
- smalltalk
- learning target set
- metadata answer
- study advice
- lesson start
- lesson continuation
- grounded doubt answer

## Non-Goals For This Milestone

- No auth.
- No admin panel.
- No quiz engine.
- No analytics.
- No production vector DB.
- No major frontend redesign beyond what the new response contract requires.
