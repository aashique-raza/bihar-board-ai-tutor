# TASK-023: LLM-first Ask Flow Rebuild

Status: DONE

## Goal

Replace the old deterministic planner/router/executor Ask API path with a simpler LLM-first flow.

New flow:

```text
User message
-> basic validation
-> load compact DB memory + recent history
-> LLM scope/retrieval decider
-> optional RAG retrieval
-> main tutor response LLM with strong system prompt
-> flexible structured response
-> save history + state
```

## Completed

- Removed the old Ask API dependency on planner/router/executor/handler modules.
- Added `backend/src/tutor/llmFlow/` with:
  - retrieval/scope decider
  - main tutor response chain
  - prompt helpers
  - JSON parsing helpers
- Rebuilt `backend/src/services/ask.service.js` around the new LLM-first flow.
- Kept response compatibility through an `answer` string while adding structured `sections`.
- Kept RAG grounding through the existing retriever and compact sources.
- Simplified chat history persistence with a turn-level `addChatMessages` helper.
- Reduced session/state get-or-create paths to upsert-style helpers.
- Removed old lesson-flow, planner, router, executor, handler, and session-context files.
- Removed old lesson/conversation regression scripts that asserted the previous response contract.
- Updated Ask DB smoke script for the new response contract.
- Strengthened the tutor prompt with:
  - Roman Hinglish language lock.
  - Silent conversation self-check.
  - Last Zuno response awareness.
  - Good/bad examples for robotic replies, identity questions, and repeat explanations.
  - No fake physical identity or location.
- Added conversation-level language lock so Hinglish remains Hinglish across turns.
- Updated frontend chat rendering to display structured `sections`.
- Rewrote active Ask API and tutor architecture docs so the current LLM-first flow is the source of truth.

## Current Problems Observed In Live Chat

- Without foundation content, broad questions like `Science kya hai?` and `Physics kya hai?` can produce weak or generic answers.
- Study-support questions like `main padhta hu par yaad nahi rehta` need approved content instead of relying only on the LLM.
- If the response uses formal section headings, the tutor can still feel like notes instead of a live tutor; frontend section rendering now reduces the worst formatting issue.
- More live QA is needed after foundation Markdown is added and indexed.

## Current Content Strategy

Add curated Markdown files under:

```text
data/class-10/science/foundation/
```

Recommended files:

```text
01-science-orientation.md
02-subject-orientation.md
03-study-skills.md
04-learning-support.md
```

Decision:

```text
Facts and examples come from curated Markdown/RAG.
The LLM gets controlled freedom to adapt tone, simplicity, examples, and repair behavior.
```

## Verification

Passed:

```bash
node --check src/services/ask.service.js
node --check src/tutor/llmFlow/retrievalDecider.js
node --check src/tutor/llmFlow/tutorResponder.js
node --check src/services/chatHistory.service.js
node --check src/services/chatSession.service.js
node --check scripts/test-ask-db-integration.js
npm.cmd run test:study-map
npm.cmd run test:chunks
npm.cmd run test:curriculum-resolvers
npm.cmd run test:vector-store
npm.cmd run build
```

Also passed after prompt/import fixes:

```bash
node -e "import('./src/services/ask.service.js').then(()=>console.log('ask service import ok'))"
node -e "import('./src/tutor/llmFlow/tutorResponder.js').then(()=>console.log('tutor responder import ok'))"
```

Passed during 2026-05-21 QA when network access was allowed:

```bash
npm.cmd run test:chat-db-models
npm.cmd run test:retrieval
npm.cmd run rag:test-retriever
```

`npm.cmd run test:ask-db` also passed earlier during QA when provider quota was available. A later pre-push rerun connected to MongoDB successfully but stopped on Groq daily token rate limit, which matches the provider-fallback risk documented in the QA report.

Additional QA artifact:

```text
docs/qa-report-2026-05-21.md
```

The QA report records the remaining product risks, especially provider fallback, retrieval sufficiency for broad foundation questions, frontend timeout behavior, and missing LLM-first regression coverage.

## Next Step

Fix the P0 QA findings:

- Add safe provider/LLM fallback handling.
- Add curated foundation Markdown content.
- Add a retrieval sufficiency guard for weak context.
