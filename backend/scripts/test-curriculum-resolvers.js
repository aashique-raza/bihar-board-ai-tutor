import assert from 'node:assert/strict';

import { loadCurriculumIndex } from '../src/curriculum/curriculumIndexStore.js';
import { resolveChapter } from '../src/curriculum/chapterResolver.js';
import {
  getChapterCoreTopics,
  resolveTopic,
} from '../src/curriculum/topicResolver.js';

const curriculumIndex = await loadCurriculumIndex();

const assertResolvedChapter = (message, expectedChapterId) => {
  const result = resolveChapter(curriculumIndex, message);

  assert.equal(result.status, 'resolved', `${message} should resolve.`);
  assert.equal(result.chapter.chapterId, expectedChapterId);

  return result;
};

assertResolvedChapter('physics chapter 3 padhao', 'science.physics.chapter-03');
assertResolvedChapter('physic ke chapter 3', 'science.physics.chapter-03');
assertResolvedChapter('electricity start kro', 'science.physics.chapter-03');
assertResolvedChapter('biology ka first chapter', 'science.biology.chapter-01');
assertResolvedChapter('life processes padhao', 'science.biology.chapter-01');

const ambiguousChapter = resolveChapter(curriculumIndex, 'chapter 3 padhao');
assert.equal(ambiguousChapter.status, 'ambiguous');
assert.ok(ambiguousChapter.matches.length > 1);

const topicResult = resolveTopic(curriculumIndex, 'electric current padhao', {
  chapterId: 'science.physics.chapter-03',
});
assert.equal(topicResult.status, 'resolved');
assert.equal(topicResult.topic.chapterId, 'science.physics.chapter-03');
assert.match(topicResult.topic.title, /electric current/i);

const globalTopicResult = resolveTopic(curriculumIndex, 'life processes nutrition');
assert.equal(globalTopicResult.status, 'resolved');
assert.equal(globalTopicResult.topic.chapterId, 'science.biology.chapter-01');

const coreTopics = getChapterCoreTopics(curriculumIndex, 'science.physics.chapter-03');
assert.ok(coreTopics.length > 0);
assert.ok(coreTopics.every((topic) => topic.role === 'core'));

console.log('Curriculum resolver tests passed.');
console.log(JSON.stringify({
  resolvedChapters: 5,
  ambiguousChecks: 1,
  resolvedTopics: 2,
  physicsChapter3CoreTopics: coreTopics.length,
}, null, 2));

