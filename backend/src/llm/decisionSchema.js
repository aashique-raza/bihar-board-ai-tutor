/**
 * decisionSchema.js
 *
 * JSON Schema for the decider LLM's output (ADR-011).
 *
 * The decider is asked to classify a student message into exactly one intent.
 * Before ADR-011 it emitted JSON as free text which `utils/jsonParser.js` then
 * scraped — a step that could fail (truncation, stray prose) and trigger a
 * fallback that produced a false "topic not in syllabus" reply (BUG-1) or a
 * wrong GREETING classification (BUG-2).
 *
 * This schema is passed to `model.withStructuredOutput()` so the provider
 * returns a guaranteed-well-formed object. On OpenAI (`strict: true`) the
 * `intent` value is constrained to the enum server-side, which is what makes
 * BUG-2 structurally impossible rather than merely handled.
 *
 * Plain JSON Schema (no Zod) — keeps the dependency list unchanged (CLAUDE.md).
 *
 * Field contract (must match what normalizeDecision() in step4 reads):
 *   intent      — one of the 9 pipeline intents. Nothing else is representable.
 *   searchQuery — decider's English retrieval phrase, or null. Only meaningful
 *                 for CONCEPT_QUESTION / EXPLAIN_MORE / OUT_OF_CONTEXT (as an
 *                 English translation); null for every other intent.
 *   examEntity  — the single subject/branch/chapter the student named, or null.
 *                 Only meaningful for EXAM_INFO.
 *   reason      — one short sentence, for logs and debugging only.
 *
 * strict mode requires: every property listed in `required`, and
 * `additionalProperties: false`. Nullable fields use the ["string","null"] union.
 */

export const DECIDER_INTENTS = [
  'UNSAFE_OR_ABUSIVE',
  'GREETING',
  'EMOTIONAL_SUPPORT',
  'CHOOSE_COURSE',
  'NEXT_STEP',
  'EXPLAIN_MORE',
  'CONCEPT_QUESTION',
  'EXAM_INFO',
  'OUT_OF_CONTEXT',
];

export const DECISION_SCHEMA_NAME = 'decider_decision';

export const decisionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'searchQuery', 'examEntity', 'reason'],
  properties: {
    intent: {
      type: 'string',
      enum: DECIDER_INTENTS,
      description: 'The single intent that best classifies the student message.',
    },
    searchQuery: {
      type: ['string', 'null'],
      description:
        'English retrieval phrase (8-15 words) for CONCEPT_QUESTION / EXPLAIN_MORE, '
        + 'or an English translation for a natural-world OUT_OF_CONTEXT message. '
        + 'null for GREETING, EMOTIONAL_SUPPORT, UNSAFE_OR_ABUSIVE, CHOOSE_COURSE, '
        + 'NEXT_STEP, EXAM_INFO, and for explicitly excluded / non-natural-world topics.',
    },
    examEntity: {
      type: ['string', 'null'],
      description:
        'For EXAM_INFO only: the one subject/branch/chapter/unit the student named, '
        + 'in canonical English (e.g. "Physics", "Life Processes"). null for every '
        + 'other intent, for general exam questions, and when two or more things are named.',
    },
    reason: {
      type: 'string',
      description: 'One short sentence explaining the classification. For logs only.',
    },
  },
};
