# ADR-004: Per-intent prompts instead of one monolithic tutor prompt

- **Date:** 2026-07 (recorded retroactively 2026-08-28)
- **Status:** Accepted

## Context
A single `tutorPrompt.js` handled every intent. It carried rules for all cases at
once, so a greeting paid for concept-question rules, and edits for one intent
regressed another.

## Decision
Each intent gets its own prompt, temperature, `maxTokens`, and history window,
dispatched by `ask/intentRouter.js`. Enabled by `USE_INTENT_ROUTER=true`.

`prompts/intents/`: greeting, emotionalSupport, redirect, unsafe, chooseCourse,
explainMore, conceptQuestion (two variants), nextStep, examInfo.
Shared identity lives in `corePersona.js`.

## Why
- Each intent sends only what it needs (redirect: 0 history; explainMore: 6 messages)
- Per-intent `maxTokens` — redirect 100, concept 1500
- Editing the greeting prompt cannot regress concept answers
- `CONCEPT_QUESTION` splits into with-chunks / no-chunks variants, so the
  with-chunks prompt has no "insufficient_context" escape hatch — it was
  refusing to answer even with 5 correct chunks present

## Rejected alternatives
| Option | Why not |
|---|---|
| One prompt with conditional sections | Same coupling problem, harder to read |
| Fine-tuned model per intent | Far too much operational overhead at this stage |

## Consequences
- **Easy:** isolated changes, lower per-turn tokens, per-intent tuning
- **Hard:** 12 prompt files to keep consistent; the legacy path still exists behind the flag (see `BACKLOG.md` O10)

## Revisit when
Prompt count becomes unmaintainable, or intents converge enough to merge
