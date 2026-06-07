/**
 * nextTopicResolver.js
 *
 * Given a chapterId and currentTopicId, returns the next core topic in sequence.
 * Used by the NEXT_STEP intent handler so students can progress through a chapter.
 *
 * Return shapes:
 *   { status: 'found',            topic: { topicId, title, order, ragHints, chapterId, ... } }
 *   { status: 'chapter_complete'                                                              }
 *   { status: 'no_chapter'                                                                    }
 */

import { getChapterCoreTopics } from './topicResolver.js';
import { loadCurriculumIndex } from './curriculumIndexLoader.js';

/**
 * Finds the next core topic after currentTopicId in the given chapter.
 *
 * @param {string}      chapterId      - e.g. "science.physics.chapter-01"
 * @param {string|null} currentTopicId - topicId the student is currently on,
 *                                       or null to start from the beginning
 * @returns {Promise<{ status: string, topic?: object }>}
 */
export const getNextTopic = async (chapterId, currentTopicId) => {
  // Step 1: Guard — null/undefined chapterId means no chapter is active
  if (!chapterId) {
    return { status: 'no_chapter' };
  }

  // Step 2: Load the curriculum index (cached after first call)
  const curriculumIndex = await loadCurriculumIndex();

  // Step 3: Get all core topics for this chapter, sorted by order
  const coreTopics = getChapterCoreTopics(curriculumIndex, chapterId);

  // Step 4: No topics means the chapterId doesn't exist (or has no core topics)
  if (coreTopics.length === 0) {
    return { status: 'no_chapter' };
  }

  // Step 5: Student hasn't started yet — return the first core topic
  if (currentTopicId === null) {
    return { status: 'found', topic: coreTopics[0] };
  }

  // Step 6: Find where the student currently is in the list
  const currentIndex = coreTopics.findIndex((topic) => topic.topicId === currentTopicId);

  // Step 7: currentTopicId was found and a next topic exists — return it
  if (currentIndex !== -1 && currentIndex < coreTopics.length - 1) {
    return { status: 'found', topic: coreTopics[currentIndex + 1] };
  }

  // Step 8: currentTopicId not found in list, or it was the last topic
  return { status: 'chapter_complete' };
};
