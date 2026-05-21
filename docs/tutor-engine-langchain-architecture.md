# Zuno Tutor Engine: Current LLM-first Architecture

## Current Direction

The previous deterministic planner/router/executor Ask flow has been removed from the runtime code. The active Ask API now uses a simpler LLM-first flow:

```text
User message
-> basic validation
-> compact DB memory + recent history
-> LLM scope/retrieval decider
-> optional RAG retrieval
-> tutor response LLM with strong system prompt
-> structured sections + sources
-> saved chat history + compact memory
```

## Core Principle

```text
Facts come from approved Markdown/RAG content.
Teaching style comes from the tutor LLM prompt.
Backend owns validation, retrieval, persistence, and source attachment.
Frontend renders structured sections instead of parsing natural language.
```

The LLM is intentionally not boxed into many rigid intents. The only first-stage decision is:

- Is the message in scope for Zuno?
- Does this turn need retrieved study content?
- If retrieval is needed, what search query should be used?

## Active Runtime Modules

```text
backend/src/services/ask.service.js
backend/src/tutor/llmFlow/retrievalDecider.js
backend/src/tutor/llmFlow/tutorResponder.js
backend/src/tutor/llmFlow/promptHelpers.js
backend/src/tutor/llmFlow/json.js
backend/src/rag/query/retriever/retriever.js
backend/src/rag/query/answer/answerService.js
```

Old modules removed from runtime:

```text
backend/src/tutor/router/*
backend/src/tutor/planner/*
backend/src/tutor/executor/*
backend/src/tutor/handlers/*
backend/src/tutor/context/*
backend/src/services/lessonFlow.service.js
backend/src/services/lessonGeneration.service.js
```

## Decider Layer

The retrieval decider does not write student-facing answers.

It returns a small JSON decision:

```json
{
  "inScope": true,
  "needsRetrieval": true,
  "responseMode": "study_tutor",
  "searchQuery": "electric current simple explanation",
  "reason": "Student is asking for a Science explanation."
}
```

Response modes:

- `conversation`: greeting, identity, motivation, light tutor chat.
- `study_tutor`: Science learning, study support, explanation, lesson, or doubt.
- `redirect`: out-of-scope request.

## Tutor Response Layer

The main tutor response LLM receives:

- Latest student message.
- Mandatory language instruction.
- Recent conversation.
- Last Zuno response.
- Compact memory from `chat_states`.
- Curriculum summary.
- Focus chapter, if selected.
- Retrieved study context, if retrieval was needed.

It returns flexible structured sections:

```json
{
  "status": "answered",
  "responseMode": "study_tutor",
  "title": "Electric Current",
  "sections": [
    {
      "heading": "Simple matlab",
      "content": "Electric current ka matlab charge ka flow hota hai."
    }
  ],
  "suggestedActions": [],
  "memoryUpdate": {}
}
```

The backend keeps a compatibility `answer` string for the current frontend while the frontend increasingly renders `sections` directly.

## Conversation Quality Rules

The prompt now includes:

- Roman Hinglish language lock when the student uses Hinglish/Hindi-in-Roman.
- Silent self-check before answering.
- Last-response awareness to avoid repeating the same explanation.
- Repair behavior if the student says Zuno is robotic, repetitive, or using the wrong language.
- No fake physical identity or location.
- Few-shot good/bad examples.

## Current Known Issues

The new flow exposed content and prompt issues:

- Broad foundation questions such as `Science kya hai?`, `Physics kya hai?`, `Chemistry kya hai?`, and `Biology kya hai?` are not yet well-covered by approved RAG content.
- Study support questions such as `main padhta hu par yaad nahi rehta` need curated foundation/study-skill content.
- Without curated foundation content, the LLM may answer from general knowledge, which weakens the project’s grounding rule.
- The frontend previously rendered only the flattened `answer`, causing headings and content to appear glued together. It now renders `sections` for Zuno messages.

## Content Plan

Add curated Foundation Markdown content under `data/class-10/science/foundation/`.

Recommended files:

```text
01-science-orientation.md
02-subject-orientation.md
03-study-skills.md
04-learning-support.md
```

Target content:

- Science kya hai?
- Physics/Chemistry/Biology kya hai?
- Science kaise padhein?
- Padhta hu par yaad nahi rehta.
- Padhne ka man nahi karta.
- Samajh nahi aaye to kya karein?

After adding content:

```bash
cd backend
npm.cmd run rag:index
```

Then live-test the same conversation prompts.

## Non-Goals

- No admin panel.
- No auth.
- No quiz engine.
- No analytics.
- No production vector DB yet.
- No return to manual intent explosion unless a narrow deterministic helper is truly needed.
