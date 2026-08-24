/**
 * test-placeholder-guard.js
 *
 * Unit test for the D1 fix (STREAM_FAILURE_FIX_PLAN.md Fix A): the
 * isPlaceholderResponse() guard in intentRouter.js that catches the LLM
 * literally echoing a prompt's example placeholder text (e.g. "Explanation
 * here") instead of writing a real answer.
 *
 * No server/LLM call needed — imports the pure function directly.
 */

import assert from 'node:assert/strict';

import { isPlaceholderResponse } from '../src/ask/intentRouter.js';

// Full placeholder leak — every section is a known placeholder string
assert.equal(
  isPlaceholderResponse([{ heading: 'Section heading', content: 'Explanation here' }]),
  true,
  'Should catch a section whose content is exactly the "Explanation here" placeholder.'
);

assert.equal(
  isPlaceholderResponse([{ heading: '', content: 'Explanation Here' }]),
  true,
  'Should be case-insensitive.'
);

assert.equal(
  isPlaceholderResponse([
    { heading: '', content: '  explanation here  ' },
  ]),
  true,
  'Should trim whitespace before matching.'
);

// Real answers must never trip the guard
assert.equal(
  isPlaceholderResponse([{ heading: 'Kya Hai Ye', content: 'Photosynthesis ek process hai jisme paudhe apna khana khud banate hain.' }]),
  false,
  'A real Hinglish answer must never match the placeholder guard.'
);

assert.equal(
  isPlaceholderResponse([{ heading: '', content: 'Aage badhein' }]),
  false,
  '"Aage badhein" is a real hardcoded chip label, not a leaked placeholder — must not match.'
);

// Mixed: one real section + one placeholder should NOT trip the guard (every() must fail)
assert.equal(
  isPlaceholderResponse([
    { heading: 'Kya Hai Ye', content: 'Real explanation text here about the actual topic.' },
    { heading: '', content: 'Explanation here' },
  ]),
  false,
  'Guard should only fire when ALL sections are placeholders, not just one.'
);

// Empty sections array must not trip the guard
assert.equal(isPlaceholderResponse([]), false, 'Empty sections array must not match.');

console.log('\x1b[32m✓ All placeholder-guard tests passed\x1b[0m');
