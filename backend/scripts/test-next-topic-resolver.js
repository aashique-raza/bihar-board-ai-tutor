/**
 * test-next-topic-resolver.js
 *
 * Unit tests for nextTopicResolver.getNextTopic().
 * No server required — reads curriculum-index.json from disk.
 *
 * Run: node --experimental-vm-modules backend/scripts/test-next-topic-resolver.js
 *   or: node backend/scripts/test-next-topic-resolver.js  (Node 18+, ESM via package.json type:module)
 */

import assert from 'node:assert/strict';

const { getNextTopic } = await import('../src/curriculum/nextTopicResolver.js');
const { getChapterCoreTopics } = await import('../src/curriculum/topicResolver.js');
const { loadCurriculumIndex } = await import('../src/curriculum/curriculumIndexLoader.js');

const CHAPTER_03 = 'science.physics.chapter-03';
const CHAPTER_BIO = 'science.biology.chapter-01';

// ---------------------------------------------------------------------------
// TEST 1: null chapterId → no_chapter
// ---------------------------------------------------------------------------
const r1 = await getNextTopic(null, null);
assert.equal(r1.status, 'no_chapter', 'null chapterId should return no_chapter');
console.log('TEST 1 PASS — null chapterId → no_chapter');

// ---------------------------------------------------------------------------
// TEST 2: invalid chapterId → no_chapter
// ---------------------------------------------------------------------------
const r2 = await getNextTopic('science.physics.chapter-99', null);
assert.equal(r2.status, 'no_chapter', 'invalid chapterId should return no_chapter');
console.log('TEST 2 PASS — invalid chapterId → no_chapter');

// ---------------------------------------------------------------------------
// TEST 3: valid chapter, null topicId → first core topic returned
// NOTE: topic.order is the global slot within ALL topics in the chapter,
//       not an index into core topics. We verify it is the lowest-ordered
//       core topic rather than asserting a hardcoded order value of 1.
// ---------------------------------------------------------------------------
const r3 = await getNextTopic(CHAPTER_03, null);
assert.equal(r3.status, 'found', 'null topicId should return first topic');
assert.ok(r3.topic, 'topic should exist');
assert.ok(r3.topic.topicId, 'topicId should exist');

// Verify r3 is actually the lowest-ordered core topic in the chapter
const idx = await loadCurriculumIndex();
const coreTopics03 = getChapterCoreTopics(idx, CHAPTER_03); // already sorted by order
assert.equal(
  r3.topic.topicId,
  coreTopics03[0].topicId,
  'returned topic should be the first (lowest-order) core topic'
);
console.log(`TEST 3 PASS — null topicId → first topic (order=${r3.topic.order}, topicId=${r3.topic.topicId})`);

// ---------------------------------------------------------------------------
// TEST 4: valid chapter, first topicId → second core topic returned
// ---------------------------------------------------------------------------
const firstTopicId = r3.topic.topicId;
const r4 = await getNextTopic(CHAPTER_03, firstTopicId);
assert.equal(r4.status, 'found', 'after first topic should return second topic');
assert.equal(
  r4.topic.topicId,
  coreTopics03[1].topicId,
  'returned topic should be the second core topic'
);
assert.ok(
  r4.topic.order > r3.topic.order,
  `second topic order (${r4.topic.order}) should be greater than first (${r3.topic.order})`
);
console.log(`TEST 4 PASS — first topicId → second topic (order=${r4.topic.order}, topicId=${r4.topic.topicId})`);

// ---------------------------------------------------------------------------
// TEST 5: valid chapter, last topicId → chapter_complete
// ---------------------------------------------------------------------------
const lastTopicId = coreTopics03[coreTopics03.length - 1].topicId;
const r5 = await getNextTopic(CHAPTER_03, lastTopicId);
assert.equal(r5.status, 'chapter_complete', 'last topic should return chapter_complete');
console.log(`TEST 5 PASS — last topicId (${lastTopicId}) → chapter_complete`);

// ---------------------------------------------------------------------------
// TEST 6: topic ragHints exist on returned topic
// ---------------------------------------------------------------------------
const r6 = await getNextTopic(CHAPTER_BIO, null);
assert.equal(r6.status, 'found', 'biology chapter-01 should return found');
assert.ok(Array.isArray(r6.topic.ragHints), 'ragHints should be array');
assert.ok(r6.topic.ragHints.length > 0, 'ragHints should not be empty');
console.log(`TEST 6 PASS — ragHints present (${r6.topic.ragHints.length} hints) on "${r6.topic.title}"`);

// ---------------------------------------------------------------------------
console.log('\nAll nextTopicResolver tests passed.');
