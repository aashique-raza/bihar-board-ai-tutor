import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatHistory } from '../src/models/chatHistory.model.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { ChatState } from '../src/models/chatState.model.js';
import { addChatMessage, getChatHistory } from '../src/services/chatHistory.service.js';
import { createChatSession, findChatSession } from '../src/services/chatSession.service.js';
import { getOrCreateChatState, updateChatState } from '../src/services/chatState.service.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

let sessionId = null;

try {
  await connectDB();

  const session = await createChatSession({
    mode: 'guest',
    title: 'Test Physics Chat',
  });

  sessionId = session.sessionId;

  const savedSession = await findChatSession(sessionId);
  assert(savedSession, 'Chat session was not saved.');
  assert(savedSession.mode === 'guest', 'Chat session mode is wrong.');

  await addChatMessage({
    sessionId,
    role: 'student',
    text: 'physics chapter 3 padhao',
  });

  await addChatMessage({
    sessionId,
    role: 'tutor',
    text: 'Chalo Electricity start karte hain.',
    action: 'start_lesson',
    sources: [
      {
        chapterTitle: 'Electricity',
        chunkId: 'physics-chapter-03-chunk-001',
      },
    ],
    metadata: {
      chapterId: 'science.physics.chapter-03',
    },
  });

  const history = await getChatHistory(sessionId);
  assert(history.length === 2, 'Chat history should have 2 messages.');
  assert(history[0].role === 'student', 'First message should be student.');
  assert(history[1].role === 'tutor', 'Second message should be tutor.');
  assert(history[1].action === 'start_lesson', 'Tutor action was not saved.');

  const firstState = await getOrCreateChatState(sessionId);
  assert(firstState.learningMode === 'idle', 'Default learning mode should be idle.');

  const updatedState = await updateChatState(sessionId, {
    currentSubjectId: 'science',
    currentSectionId: 'physics',
    currentChapterId: 'science.physics.chapter-03',
    currentTopicId: 'science.physics.chapter-03.topic-04',
    learningMode: 'lesson',
    preferredStudyMode: 'global',
    pendingAction: 'continue_lesson',
    completedTopicIds: ['science.physics.chapter-03.topic-04'],
    lastTutorAction: 'start_lesson',
    lastStudentMessage: 'physics chapter 3 padhao',
  });

  assert(updatedState.learningMode === 'lesson', 'Learning mode was not updated.');
  assert(updatedState.currentChapterId === 'science.physics.chapter-03', 'Chapter was not updated.');
  assert(updatedState.completedTopicIds.length === 1, 'Completed topics were not saved.');

  console.log('Chat DB model tests passed.');
  console.log(JSON.stringify({
    sessionId,
    chatHistoryMessages: history.length,
    currentChapterId: updatedState.currentChapterId,
    currentTopicId: updatedState.currentTopicId,
  }, null, 2));
} catch (error) {
  console.error(`Chat DB model tests failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (sessionId) {
    await ChatHistory.deleteMany({ sessionId });
    await ChatState.deleteOne({ sessionId });
    await ChatSession.deleteOne({ sessionId });
  }

  await disconnectDB();
}

