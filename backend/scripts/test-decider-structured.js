/**
 * test-decider-structured.js
 *
 * Failing test for BUG-1 and BUG-2 (STAGE1_DONE.md Section C, ADR-011,
 * BUG1_FIX_PLAN.md).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ STATE: PRE-FIX. These assertions document the CURRENT BUGGY behaviour.   │
 * │ After the decider is converted to withStructuredOutput (ADR-011), the    │
 * │ assertions in the two "AFTER FIX" blocks replace the "BEFORE FIX" ones.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * No server, no network, no API key. The decider's chat model is mocked so we
 * control exactly what "the LLM returned" for each scenario.
 *
 * Run: npm run test:decider-structured
 *      (needs node --experimental-test-module-mocks — set in the package script)
 */

import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { AIMessage } from '@langchain/core/messages';

// What the mocked decider "LLM" returns on the next call. Mutated per scenario.
// A function seam (not a value) so the lazy chain singleton in step4 keeps working
// even though it is cached after the first build.
let fakeDeciderRaw = '';

mock.module(new URL('../src/llm/chatModel.js', import.meta.url).href, {
  exports: {
    createChatModel: () => async () => new AIMessage(fakeDeciderRaw),
  },
});

// Import AFTER the mock is registered.
const { decideRetrieval } = await import('../src/ask/step4.decideRetrieval.js');

const CTX = { deciderHistory: '', language: { detectedLanguage: 'hinglish' } };

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failures++;
    console.log(`\x1b[31m✗ ${name}\x1b[0m\n    ${err.message}`);
  }
};

// ───────────────────────────────────────────────────────────────────────────
// BUG-1 — decider returns malformed JSON → false "topic not in syllabus"
// ───────────────────────────────────────────────────────────────────────────
// A real science question. The decider's output is truncated / unparseable
// (simulates the maxTokens:350 cut-off or an extra-prose glitch).
fakeDeciderRaw = '{ "intent": "CONCEPT_QUESTION", "searchQuery": "newton first la';

let bug1Result = null;
let bug1Threw = null;
try {
  bug1Result = await decideRetrieval({ question: 'Newton ka pehla law kya hai?' }, CTX);
} catch (err) {
  bug1Threw = err;
}

// ── BEFORE FIX (current behaviour — this block PASSES today, proving the bug) ──
check('BUG-1 [pre-fix] malformed decider output does NOT throw', () => {
  assert.equal(bug1Threw, null, 'expected a silent fallback, not an error');
});
check('BUG-1 [pre-fix] fallback sets needsRetrieval:false (the defect)', () => {
  assert.equal(bug1Result.needsRetrieval, false);
});
check('BUG-1 [pre-fix] fallback claims in-scope CONCEPT_QUESTION with no search', () => {
  assert.equal(bug1Result.intent, 'CONCEPT_QUESTION');
  assert.equal(bug1Result.inScope, true);
  assert.equal(bug1Result.searchQuery, null);
  assert.equal(bug1Result.reason, 'Parse error fallback');
});
// This is the student-visible consequence: intent=CONCEPT_QUESTION + no chunks
// → intentRouter resolveChainKey → CONCEPT_QUESTION_NO_CHUNKS → hardcoded
// "yeh topic aapke syllabus mein nahi hai".

// ── AFTER FIX (ADR-011) — uncomment, delete the BEFORE-FIX block above ──
// With withStructuredOutput the provider cannot return unparseable output at all.
// A genuine provider failure must surface honestly, not as a false scope rejection.
// check('BUG-1 [post-fix] decider failure surfaces as an error, never a false rejection', () => {
//   assert.ok(bug1Threw, 'expected decideRetrieval to throw ProviderUnavailableError');
//   assert.equal(bug1Threw.name, 'ProviderUnavailableError');
// });

// ───────────────────────────────────────────────────────────────────────────
// BUG-2 — decider returns valid JSON but an unrecognised intent value
// ───────────────────────────────────────────────────────────────────────────
// Valid JSON, "CONCEPT_QUESTON" (missing an I) — a plausible LLM typo.
fakeDeciderRaw = JSON.stringify({
  intent: 'CONCEPT_QUESTON',
  searchQuery: 'photosynthesis in plants leaves food production',
  examEntity: null,
  reason: 'science question',
});

const bug2Result = await decideRetrieval({ question: 'Photosynthesis kya hai?' }, CTX);

// ── BEFORE FIX (current behaviour — PASSES today, proving the bug) ──
check('BUG-2 [pre-fix] unknown intent value falls back to GREETING (the defect)', () => {
  assert.equal(bug2Result.intent, 'GREETING');
});
check('BUG-2 [pre-fix] a science question is thereby treated as small talk', () => {
  assert.equal(bug2Result.needsRetrieval, false);
  assert.equal(bug2Result.inScope, true); // GREETING is "in scope" → not redirected, just wrong
});
// Consequence: GREETING increments the non-academic drift counter; after
// MAX_NON_ACADEMIC_TURNS such turns the student is hard-blocked from a
// subject they were actually studying.

// ── AFTER FIX (ADR-011) — uncomment, delete the BEFORE-FIX block above ──
// The decider schema's `intent` enum makes an out-of-enum value impossible.
// If the mock still forces one through, normalizeDecision must NOT silently
// treat a science question as GREETING — CONCEPT_QUESTION is the safe default.
// check('BUG-2 [post-fix] unknown intent defaults to CONCEPT_QUESTION, never GREETING', () => {
//   assert.notEqual(bug2Result.intent, 'GREETING');
// });

// ───────────────────────────────────────────────────────────────────────────
// Control — a clean, valid decider response still works end to end
// ───────────────────────────────────────────────────────────────────────────
fakeDeciderRaw = JSON.stringify({
  intent: 'CONCEPT_QUESTION',
  searchQuery: 'how does photosynthesis produce food in plant leaves',
  examEntity: null,
  reason: 'direct science concept question',
});
const okResult = await decideRetrieval({ question: 'Photosynthesis kya hai?' }, CTX);
check('control: valid decider output → CONCEPT_QUESTION with retrieval', () => {
  assert.equal(okResult.intent, 'CONCEPT_QUESTION');
  assert.equal(okResult.needsRetrieval, true);
  assert.ok(okResult.searchQuery && okResult.searchQuery.length > 0);
});

console.log('');
if (failures > 0) {
  console.log(`\x1b[31m${failures} check(s) failed\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mAll decider-structured checks passed\x1b[0m');
console.log('\x1b[33m(pre-fix state: the BUG-1/BUG-2 checks passing = the bugs are present exactly as described)\x1b[0m');
