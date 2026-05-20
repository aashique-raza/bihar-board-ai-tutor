import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatHistory } from '../src/models/chatHistory.model.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { ChatState } from '../src/models/chatState.model.js';
import { askQuestion } from '../src/services/ask.service.js';
import { getChatState } from '../src/services/chatState.service.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const cleanupSessions = async (sessionIds) => {
  for (const sessionId of sessionIds.filter(Boolean)) {
    await ChatHistory.deleteMany({ sessionId });
    await ChatState.deleteOne({ sessionId });
    await ChatSession.deleteOne({ sessionId });
  }
};

const runChemistryLessonConversation = async () => {
  const greeting = await askQuestion({
    question: 'hello',
    studyMode: 'global',
  });
  const sessionId = greeting.session.sessionId;

  assert(greeting.status === 'small_talk', 'Greeting should return small_talk.');

  const target = await askQuestion({
    sessionId,
    question: 'mai aaj chemistry padhna chahta hu',
    studyMode: 'global',
  });

  assert(target.status === 'learning_target_set', 'Subject-only study intent should set learning target.');
  assert(target.answer.includes('Chemistry me 5 chapters'), 'Chemistry target should list chapters.');
  assert(target.answer.includes('Kaunsa chapter start karein'), 'Chemistry target should ask for chapter.');

  const targetState = await getChatState(sessionId);
  assert(targetState.currentSectionId === 'chemistry', 'State should save Chemistry as current section.');
  assert(targetState.pendingAction === 'choose_chapter', 'State should wait for chapter selection.');

  const lesson = await askQuestion({
    sessionId,
    question: 'chapter 4',
    studyMode: 'global',
  });

  assert(lesson.status === 'lesson_started', 'Chapter number follow-up should start a lesson.');
  assert(lesson.lesson.chapterId === 'science.chemistry.chapter-04', 'Lesson should use Chemistry chapter 4.');
  assert(lesson.sources.length > 0, 'Started lesson should include sources.');

  const nextLesson = await askQuestion({
    sessionId,
    question: 'next',
    studyMode: 'global',
  });

  assert(nextLesson.status === 'lesson_continued', 'Next should continue the lesson.');
  assert(nextLesson.lesson.topicId !== lesson.lesson.topicId, 'Next should move to a different topic.');

  const sideDoubt = await askQuestion({
    sessionId,
    question: 'cricket score kya hai?',
    studyMode: 'global',
  });

  assert(
    sideDoubt.status === 'global_context_not_found',
    'Out-of-scope side doubt should use the safe no-context fallback.'
  );

  const stateAfterSideDoubt = await getChatState(sessionId);
  assert(
    stateAfterSideDoubt.currentChapterId === 'science.chemistry.chapter-04',
    'Out-of-scope side doubt should not clear the current lesson chapter.'
  );
  assert(
    stateAfterSideDoubt.learningMode === 'lesson',
    'Out-of-scope side doubt should not move the learner out of lesson mode.'
  );
  assert(
    stateAfterSideDoubt.pendingAction === 'continue_lesson',
    'Out-of-scope side doubt should preserve the continue lesson action.'
  );

  return sessionId;
};

const runMetadataConversation = async () => {
  const response = await askQuestion({
    question: 'biology me kitne chapter hai',
    studyMode: 'global',
  });

  assert(response.status === 'metadata_answered', 'Biology chapter count should be metadata_answered.');
  assert(response.answer.includes('Biology me 4 chapters available hain'), 'Biology metadata should list 4 chapters.');

  return response.session.sessionId;
};

const runDoubtConversation = async () => {
  const response = await askQuestion({
    question: 'blood kya hai',
    studyMode: 'global',
  });

  assert(response.status === 'answered', 'Grounded doubt should be answered.');
  assert(response.sources.length > 0, 'Grounded doubt should include sources.');

  return response.session.sessionId;
};

const sessionIds = [];

try {
  await connectDB();

  sessionIds.push(await runChemistryLessonConversation());
  sessionIds.push(await runMetadataConversation());
  sessionIds.push(await runDoubtConversation());

  console.log('Tutor conversation tests passed.');
  console.log(JSON.stringify({
    conversations: 3,
    checked: [
      'greeting',
      'subject-only study intent',
      'chapter follow-up lesson start',
      'next lesson topic',
      'side doubt does not clear lesson state',
      'metadata chapter count',
      'grounded doubt answer',
    ],
  }, null, 2));
} catch (error) {
  console.error(`Tutor conversation tests failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanupSessions(sessionIds);
  await disconnectDB();
}
