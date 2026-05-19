import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatHistory } from '../src/models/chatHistory.model.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { ChatState } from '../src/models/chatState.model.js';
import { askQuestion } from '../src/services/ask.service.js';
import { getChatHistory } from '../src/services/chatHistory.service.js';
import { getChatState } from '../src/services/chatState.service.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

let sessionId = null;

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

  console.log('Ask API DB integration test passed.');
  console.log(JSON.stringify({
    sessionId,
    savedMessages: history.length,
    intent: response.intent,
    learningMode: state.learningMode,
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

  await disconnectDB();
}

