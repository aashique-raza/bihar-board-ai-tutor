# ADR-011: Decider LLM uses structured output; parse-error fallback removed

- **Date:** 2026-08-28
- **Status:** Accepted

## Context

Stage 1 (`STAGE1_DONE.md` Section C) requires fixing 8 verified bugs. Two of
them — **BUG-1** and **BUG-2** — share a single root cause in the decider LLM
call (`ask/step4.decideRetrieval.js`):

- The decider is asked to emit JSON as free text. `utils/jsonParser.js` then
  scrapes an object out of that text.
- When the text is malformed (truncation, extra prose), `parseJsonObject()`
  throws. The `catch` block returns a hardcoded "safe default" decision with
  `intent: 'CONCEPT_QUESTION'` **and** `needsRetrieval: false` — a
  self-contradictory pair that routes the student to the
  `CONCEPT_QUESTION_NO_CHUNKS` prompt, whose output is a fixed *"this topic is
  not in your syllabus"* message. **BUG-1**: a valid science question gets a
  false rejection because of a transient formatting glitch.
- When the JSON parses but `intent` holds an unrecognised value,
  `normalizeDecision()` falls back to `GREETING`. **BUG-2**: a science question
  becomes small talk and increments the drift counter toward a hard block.

`AUDIT_RULES.md` Rule 4 forbids patching the symptom (e.g. making the fallback
smarter). The cause — free-text JSON that can fail to parse — must be removed.

`BACKLOG.md` item **O2 (structured output)** already names this exact fix and
already states it "removes the cause behind Stage 1 bugs BUG-1 and BUG-2". O2 was
filed as Stage 2. This ADR moves a **slice** of it into Stage 1.

## Decision

Convert **only the decider chain** to LangChain's
`model.withStructuredOutput(schema)` with a JSON Schema (9-value `intent` enum).
Delete the `parse_error` fallback branch in `step4.decideRetrieval.js` and the
now-unreachable unknown-intent fallback in `normalizeDecision()`.

The tutor / intentRouter chains are **not** converted here — they stream
(`.stream()`), which makes structured output materially more complex, and they
are unrelated to BUG-1/BUG-2. They remain in `BACKLOG.md` O2 as Stage 2 work.
`utils/jsonParser.js` stays (the tutor side still uses it).

## Why

- It is the only Rule 4-compliant fix for BUG-1 and BUG-2: it removes the cause
  (fallible free-text parsing) rather than guarding the symptom.
- `withStructuredOutput` is a **LangChain** abstraction, not an OpenAI method.
  It works across `ChatOpenAI` / `ChatGroq` / `ChatGoogleGenerativeAI`; LangChain
  picks the provider-appropriate mechanism (OpenAI `json_schema` strict, Groq
  function calling, Gemini `responseSchema`). Provider-switching via
  `LLM_PROVIDER` is preserved — this contradicts nothing in ADR-003.
- No new npm dependency: `withStructuredOutput` accepts a raw JSON Schema object
  (Zod is optional and not installed).
- The decider is small, single-purpose, non-streaming, and has exactly one
  caller — the lowest-risk possible place to introduce this pattern.
- One enum on `intent` makes BUG-2 structurally impossible, not merely handled.

## Rejected alternatives

| Option | Why not |
|---|---|
| Symptom patch: make the parse-error fallback set `needsRetrieval: true` | `AUDIT_RULES.md` Rule 4 — the parse failure still happens; this is exactly the layering loop the rules exist to stop |
| Convert the whole of O2 (decider + tutor) now | Tutor chains stream; structured output + streaming needs partial-parse handling — real risk, and out of scope for BUG-1/BUG-2. Stays Stage 2. |
| Leave BUG-1/BUG-2 for Stage 2 | They are launch blockers in `STAGE1_DONE.md` Section C — students get false "not in syllabus" answers and silent drift-blocking today |
| Add Zod for the schema | New dependency; `CLAUDE.md` "no new packages without a clear reason". Raw JSON Schema is sufficient. |

## Consequences

- **Easy:** decider output is guaranteed well-formed; the `parse_error` branch and
  the unknown-intent branch are deleted, not added to; BUG-1 and BUG-2 close
  together; the pattern is proven on a safe surface before Stage 2 extends it.
- **Hard:** the decider now depends on the provider's structured-output support.
  On OpenAI (currently active) this is a hard server-side guarantee; on Groq /
  Gemini it is function-calling-based and slightly weaker. A provider switch
  requires re-testing the decider. Structured-output behaviour with
  `temperature: 0` / `maxTokens: 350` must be verified (covered by the fix's
  test plan).
- A genuine provider failure that previously fell through the `parse_error` path
  now surfaces as `ProviderUnavailableError` → an honest "try again shortly"
  message instead of a false scope rejection. This is the intended behaviour.

## Revisit when

- `LLM_PROVIDER` / `DECIDER_PROVIDER` is switched away from OpenAI — re-verify the
  decider's structured output on the new provider.
- Stage 2 picks up the remainder of `BACKLOG.md` O2 (tutor / intentRouter) — at
  which point `utils/jsonParser.js` may finally be removable.
