import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatHistory } from '../src/models/chatHistory.model.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { ChatState } from '../src/models/chatState.model.js';
import { askQuestion } from '../src/ask/askOrchestrator.js';
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
  assert(response.responseMode, 'Response should include responseMode.');
  assert(Array.isArray(response.sections), 'Response should include structured sections.');
  assert(response.answer, 'Response should include compatibility answer text.');

  const history = await getChatHistory(sessionId);
  assert(history.length === 2, 'Chat history should save student and tutor messages.');
  assert(history[0].role === 'student', 'First saved message should be student.');
  assert(history[1].role === 'tutor', 'Second saved message should be tutor.');
  assert(history[1].action === response.responseMode, 'Tutor message action should match responseMode.');

  const state = await getChatState(sessionId);
  assert(state, 'Chat state should be created.');
  assert(state.preferredStudyMode === 'global', 'Study mode should be saved in state.');
  assert(state.lastStudentMessage === 'hii', 'Last student message should be saved.');
  assert(state.lastAnswer === response.answer, 'Last answer should be saved.');

  console.log('Ask API DB integration test passed.');
  console.log(JSON.stringify({
    sessionId,
    savedMessages: history.length,
    responseMode: response.responseMode,
    status: response.status,
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
