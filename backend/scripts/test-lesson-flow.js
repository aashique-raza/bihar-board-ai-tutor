import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatHistory } from '../src/models/chatHistory.model.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { ChatState } from '../src/models/chatState.model.js';
import { askQuestion } from '../src/services/ask.service.js';
import { getChatHistory } from '../src/services/chatHistory.service.js';
import { getChatState } from '../src/services/chatState.service.js';

process.env.RAG_EXTRACTIVE_ONLY = 'true';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertCompactSources = (sources, message) => {
  assert(sources.length > 0, `${message}: expected sources.`);

  const sourceIds = sources.map((source) => source.sourceId || source.headingPath || source.chunkId);
  assert(new Set(sourceIds).size === sourceIds.length, `${message}: sources should be deduplicated.`);

  for (const source of sources) {
    assert(source.label, `${message}: source label is required.`);
    assert(source.sourceTitle, `${message}: sourceTitle is required.`);
    assert(source.topicTitle, `${message}: topicTitle is required.`);
    assert(Array.isArray(source.chunkIds), `${message}: chunkIds should be an array.`);
  }
};

let sessionId = null;
let sectionSessionId = null;

try {
  await connectDB();

  const firstResponse = await askQuestion({
    question: 'physics chapter 3 padhao',
    studyMode: 'global',
  });

  sessionId = firstResponse.session.sessionId;

  assert(firstResponse.status === 'lesson_started', 'First response should start lesson.');
  assert(firstResponse.lesson.chapterId === 'science.physics.chapter-03', 'Lesson should use Physics chapter 3.');
  assert(firstResponse.lesson.topicId, 'Lesson should include first topic id.');
  assertCompactSources(firstResponse.sources, 'Started lesson');
  assert(firstResponse.lesson.generationMode, 'Started lesson should include generation mode.');
  assert(
    !firstResponse.answer.includes('Next step me is topic ka grounded lesson content'),
    'Started lesson should not return the old placeholder lesson text.'
  );
  assert(
    !firstResponse.answer.includes('enough lesson content nahi hai'),
    'Started lesson should generate usable lesson content.'
  );

  const firstState = await getChatState(sessionId);
  assert(firstState.currentChapterId === 'science.physics.chapter-03', 'State should save current chapter.');
  assert(firstState.currentTopicId === firstResponse.lesson.topicId, 'State should save first topic.');
  assert(firstState.learningMode === 'lesson', 'State should be in lesson mode.');

  const secondResponse = await askQuestion({
    sessionId,
    question: 'next',
    studyMode: 'global',
  });

  assert(secondResponse.status === 'lesson_continued', 'Second response should continue lesson.');
  assert(secondResponse.lesson.topicId !== firstResponse.lesson.topicId, 'Next should move to a new topic.');
  assertCompactSources(secondResponse.sources, 'Continued lesson');
  assert(
    !secondResponse.answer.includes('enough lesson content nahi hai'),
    'Continued lesson should generate usable lesson content.'
  );

  const secondState = await getChatState(sessionId);
  assert(secondState.currentTopicId === secondResponse.lesson.topicId, 'State should save next topic.');
  assert(secondState.completedTopicIds.length >= 2, 'Completed topics should include both lesson topics.');

  const history = await getChatHistory(sessionId);
  assert(history.length === 4, 'Two student and two tutor messages should be saved.');

  const sectionResponse = await askQuestion({
    question: 'mai aaj physic padhunga',
    studyMode: 'global',
  });
  sectionSessionId = sectionResponse.session.sessionId;

  const chapterOneResponse = await askQuestion({
    sessionId: sectionSessionId,
    question: 'chapter 1 start kro',
    studyMode: 'global',
  });

  assert(
    chapterOneResponse.status === 'lesson_started',
    'Chapter number should start lesson after section context is saved.'
  );
  assert(
    chapterOneResponse.lesson.chapterId === 'science.physics.chapter-01',
    'Ambiguous chapter 1 should resolve to Physics chapter 1 from saved state.'
  );

  console.log('Lesson flow test passed.');
  console.log(JSON.stringify({
    sessionId,
    firstTopic: firstResponse.lesson.topicTitle,
    firstGenerationMode: firstResponse.lesson.generationMode,
    nextTopic: secondResponse.lesson.topicTitle,
    nextGenerationMode: secondResponse.lesson.generationMode,
    stateResolvedChapter: chapterOneResponse.lesson.chapterTitle,
    savedMessages: history.length,
  }, null, 2));
} catch (error) {
  console.error(`Lesson flow test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (sessionId) {
    await ChatHistory.deleteMany({ sessionId });
    await ChatState.deleteOne({ sessionId });
    await ChatSession.deleteOne({ sessionId });
  }

  if (sectionSessionId) {
    await ChatHistory.deleteMany({ sessionId: sectionSessionId });
    await ChatState.deleteOne({ sessionId: sectionSessionId });
    await ChatSession.deleteOne({ sessionId: sectionSessionId });
  }

  await disconnectDB();
}
