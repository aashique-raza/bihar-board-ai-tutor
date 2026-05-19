import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatHistory } from '../src/models/chatHistory.model.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { ChatState } from '../src/models/chatState.model.js';
import { askQuestion } from '../src/services/ask.service.js';
import { createChatSession } from '../src/services/chatSession.service.js';
import { getChatHistory } from '../src/services/chatHistory.service.js';
import { getChatState, updateChatState } from '../src/services/chatState.service.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

let sessionId = null;
let seededSessionId = null;

try {
  await connectDB();

  const response = await askQuestion({
    question: 'hii',
    studyMode: 'global',
  });

  sessionId = response.session.sessionId;

  assert(sessionId, 'Response should include sessionId.');
  assert(response.intent === 'greeting', 'Ask API should return greeting intent.');

  const history = await getChatHistory(sessionId);
  assert(history.length === 2, 'Chat history should save student and tutor messages.');
  assert(history[0].role === 'student', 'First saved message should be student.');
  assert(history[1].role === 'tutor', 'Second saved message should be tutor.');
  assert(history[1].action === 'greeting', 'Tutor message action should be greeting.');

  const state = await getChatState(sessionId);
  assert(state, 'Chat state should be created.');
  assert(state.learningMode === 'idle', 'Greeting should keep learning mode idle.');
  assert(state.preferredStudyMode === 'global', 'Study mode should be saved in state.');
  assert(state.lastStudentMessage === 'hii', 'Last student message should be saved.');

  const seededSession = await createChatSession({
    title: 'Seeded Physics Chat',
  });
  seededSessionId = seededSession.sessionId;

  await updateChatState(seededSessionId, {
    currentSubjectId: 'science',
    currentSectionId: 'physics',
    lastTopic: 'Electricity',
  });

  const metadataResponse = await askQuestion({
    sessionId: seededSessionId,
    question: 'kitne chapter hai',
    studyMode: 'global',
  });

  assert(metadataResponse.status === 'metadata_answered', 'Seeded DB state should answer metadata question.');
  assert(metadataResponse.session.lastSection === 'physics', 'Session context should be hydrated from DB state.');
  assert(
    metadataResponse.answer.includes('Physics me 7 chapters available hain'),
    'Metadata answer should use Physics from DB state.'
  );

  console.log('Ask API DB integration test passed.');
  console.log(JSON.stringify({
    sessionId,
    savedMessages: history.length,
    intent: response.intent,
    learningMode: state.learningMode,
    dbHydratedSection: metadataResponse.session.lastSection,
  }, null, 2));
} catch (error) {
  console.error(`Ask API DB integration test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (sessionId) {
    await ChatHistory.deleteMany({ sessionId });
    await ChatState.deleteOne({ sessionId });
    await ChatSession.deleteOne({ sessionId });
  }

  if (seededSessionId) {
    await ChatHistory.deleteMany({ sessionId: seededSessionId });
    await ChatState.deleteOne({ sessionId: seededSessionId });
    await ChatSession.deleteOne({ sessionId: seededSessionId });
  }

  await disconnectDB();
}
