/**
 * test-decider-structured.js
 *
 * Test for the BUG-1 / BUG-2 fix (STAGE1_DONE.md Section C, ADR-011,
 * BUG1_FIX_PLAN.md).
 *
 * STATE: POST-FIX. The decider chain now uses `model.withStructuredOutput()`.
 * The provider returns a parsed object matching decisionSchema — there is no
 * free-text JSON to scrape and no parse-error fallback.
 *
 * No server, no network, no API key. The decider's chat model is mocked so we
 * control exactly what the "structured output" runnable returns (or throws).
 *
 * Run: npm run test:decider-structured
 *      (needs node --experimental-test-module-mocks — set in the package script)
 *
 * Git history holds the PRE-FIX version of this file, whose checks asserted the
 * old buggy behaviour (needsRetrieval:false fallback / GREETING misroute).
 */

import assert from 'node:assert/strict';
import { mock } from 'node:test';

// The mocked structured-output runnable's behaviour for the next call.
// Set `next` to an object to return it; set `throwNext` to an Error to throw.
let next = null;
let throwNext = null;

mock.module(new URL('../src/llm/chatModel.js', import.meta.url).href, {
  exports: {
    createChatModel: () => ({
      // step4 calls model.withStructuredOutput(schema, opts) and pipes the result
      withStructuredOutput: () => async () => {
        if (throwNext) throw throwNext;
        return next;
      },
    }),
  },
});

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
// BUG-1 — a decider failure must surface honestly, never as a false rejection
// ───────────────────────────────────────────────────────────────────────────
// Structured output cannot produce malformed JSON. The remaining failure mode
// is a genuine provider error. It must throw (→ orchestrator returns an honest
// "try again shortly"), NOT return a silent in-scope decision that routes the
// student to the hardcoded "topic not in syllabus" reply.
await (async () => {
  throwNext = new Error('simulated provider outage');
  next = null;
  let threw = null;
  try {
    await decideRetrieval({ question: 'Newton ka pehla law kya hai?' }, CTX);
  } catch (err) {
    threw = err;
  }
  throwNext = null;

  check('BUG-1 fixed: decider failure throws ProviderUnavailableError', () => {
    assert.ok(threw, 'expected decideRetrieval to throw, not fall back silently');
    assert.equal(threw.name, 'ProviderUnavailableError');
  });
  check('BUG-1 fixed: no silent "Parse error fallback" decision is returned', () => {
    assert.ok(threw, 'must not resolve at all on decider failure');
  });
})();

// ───────────────────────────────────────────────────────────────────────────
// BUG-2 — an unrecognised intent value must never become GREETING
// ───────────────────────────────────────────────────────────────────────────
// The decisionSchema `intent` enum makes this impossible in production. This
// check exercises normalizeDecision's defensive fallback directly, by forcing a
// bad value through the mock.
await (async () => {
  throwNext = null;
  next = {
    intent: 'CONCEPT_QUESTON', // typo — not in the enum
    searchQuery: 'photosynthesis in plant leaves food production',
    examEntity: null,
    reason: 'science question',
  };
  const result = await decideRetrieval({ question: 'Photosynthesis kya hai?' }, CTX);

  check('BUG-2 fixed: unknown intent defaults to CONCEPT_QUESTION, never GREETING', () => {
    assert.notEqual(result.intent, 'GREETING');
    assert.equal(result.intent, 'CONCEPT_QUESTION');
  });
  check('BUG-2 fixed: the question stays retrieval-backed, not small talk', () => {
    assert.equal(result.needsRetrieval, true);
  });
})();

// ───────────────────────────────────────────────────────────────────────────
// Control — a clean structured decision flows through unchanged
// ───────────────────────────────────────────────────────────────────────────
await (async () => {
  throwNext = null;
  next = {
    intent: 'CONCEPT_QUESTION',
    searchQuery: 'how does photosynthesis produce food in plant leaves',
    examEntity: null,
    reason: 'direct science concept question',
  };
  const result = await decideRetrieval({ question: 'Photosynthesis kya hai?' }, CTX);

  check('control: CONCEPT_QUESTION → needsRetrieval true, searchQuery preserved', () => {
    assert.equal(result.intent, 'CONCEPT_QUESTION');
    assert.equal(result.needsRetrieval, true);
    assert.equal(result.searchQuery, 'how does photosynthesis produce food in plant leaves');
  });
})();

await (async () => {
  throwNext = null;
  next = { intent: 'GREETING', searchQuery: null, examEntity: null, reason: 'casual hello' };
  const result = await decideRetrieval({ question: 'hii' }, CTX);
  check('control: GREETING → no retrieval', () => {
    assert.equal(result.intent, 'GREETING');
    assert.equal(result.needsRetrieval, false);
  });
})();

console.log('');
if (failures > 0) {
  console.log(`\x1b[31m${failures} check(s) failed\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mAll decider-structured checks passed\x1b[0m');
