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

  // Step 6b: currentTopicId doesn't resolve in the current topic list — e.g. after a
  // curriculum restructure changed topic IDs (this happened once already, see BUG-3 in
  // FOCUS_MODE_PLAN.md). This is a lost pointer, not a genuinely finished chapter — treating
  // it as chapter_complete would falsely tell the student they're done. Self-heal by
  // resyncing to topic 1 instead, and log it so a silent resync is never invisible.
  if (currentIndex === -1) {
    console.warn(
      `[nextTopicResolver] currentTopicId "${currentTopicId}" not found in chapter "${chapterId}" — resyncing to topic 1 (likely a stale pointer from a content restructure).`
    );
    return { status: 'found', topic: coreTopics[0] };
  }

  // Step 7: currentTopicId was found and a next topic exists — return it
  if (currentIndex < coreTopics.length - 1) {
    return { status: 'found', topic: coreTopics[currentIndex + 1] };
  }

  // Step 8: currentTopicId was found and it was the last topic — genuinely done
  return { status: 'chapter_complete' };
};
