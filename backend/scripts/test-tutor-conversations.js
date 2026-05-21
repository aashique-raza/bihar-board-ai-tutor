import { connectDB, disconnectDB } from '../src/db/mongooseClient.js';
import { ChatHistory } from '../src/models/chatHistory.model.js';
import { ChatSession } from '../src/models/chatSession.model.js';
import { ChatState } from '../src/models/chatState.model.js';
import { askQuestion } from '../src/services/ask.service.js';
import { getChatState } from '../src/services/chatState.service.js';

process.env.RAG_EXTRACTIVE_ONLY = 'true';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertIncludes = (value, expected, message) => {
  assert(String(value || '').includes(expected), message);
};

const assertCompactSources = (sources, message) => {
  assert(sources.length > 0, `${message}: expected sources.`);

  const sourceIds = sources.map((source) => source.sourceId || source.headingPath || source.chunkId);
  assert(
    new Set(sourceIds).size === sourceIds.length,
    `${message}: sources should be deduplicated.`
  );

  for (const source of sources) {
    assert(source.label, `${message}: source label is required.`);
    assert(source.sourceTitle, `${message}: sourceTitle is required.`);
    assert(source.chapterTitle, `${message}: chapterTitle is required.`);
    assert(source.topicTitle, `${message}: topicTitle is required.`);
    assert(source.chunkId, `${message}: chunkId is required for compatibility.`);
    assert(Array.isArray(source.chunkIds), `${message}: chunkIds should be an array.`);
  }
};

const cleanupSessions = async (sessionIds) => {
  for (const sessionId of sessionIds.filter(Boolean)) {
    await ChatHistory.deleteMany({ sessionId });
    await ChatState.deleteOne({ sessionId });
    await ChatSession.deleteOne({ sessionId });
  }
};

const askInSession = async ({ sessionId, question, studyMode = 'global', chapterId }) =>
  askQuestion({
    sessionId,
    question,
    studyMode,
    ...(chapterId ? { chapterId } : {}),
  });

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
  assertCompactSources(lesson.sources, 'Started lesson');

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
  assert(
    !stateAfterSideDoubt.lastDoubtTopic,
    'Out-of-scope side doubt should not replace the last grounded doubt topic.'
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
  assertCompactSources(response.sources, 'Grounded doubt answer');

  return response.session.sessionId;
};

const runBiologyChapterNumberConversation = async () => {
  const target = await askQuestion({
    question: 'biology padhna hai',
    studyMode: 'global',
  });
  const sessionId = target.session.sessionId;

  assert(target.status === 'learning_target_set', 'Biology study intent should set learning target.');

  const lesson = await askInSession({
    sessionId,
    question: 'chapter 2',
  });

  assert(lesson.status === 'lesson_started', 'Chapter number should start lesson from saved Biology section.');
  assert(
    lesson.lesson.chapterId === 'science.biology.chapter-02',
    'Chapter number follow-up should resolve to Biology chapter 2.'
  );

  const nextLesson = await askInSession({
    sessionId,
    question: 'next',
  });

  assert(nextLesson.status === 'lesson_continued', 'Next should continue Biology chapter 2 lesson.');
  assert(
    nextLesson.lesson.chapterId === 'science.biology.chapter-02',
    'Next should stay inside Biology chapter 2.'
  );

  return sessionId;
};

const runFocusOutOfChapterConversation = async () => {
  const response = await askQuestion({
    question: 'photosynthesis kya hota hai',
    studyMode: 'focus',
    chapterId: 'science.physics.chapter-03',
  });

  assert(
    response.status === 'focus_context_not_found',
    `Focus mode should refuse questions outside the selected chapter context. Got ${response.status}.`
  );
  assert(response.sources.length === 0, 'Focus refusal should not return unrelated sources.');
  assert(response.suggestedActions.some((action) => action.type === 'switch_to_global'), 'Focus refusal should suggest Global Mode.');

  return response.session.sessionId;
};

const runFollowUpDoubtConversation = async () => {
  const lesson = await askQuestion({
    question: 'biology chapter 1 padhao',
    studyMode: 'global',
  });
  const sessionId = lesson.session.sessionId;

  assert(lesson.status === 'lesson_started', 'Biology chapter 1 lesson should start.');

  const doubt = await askInSession({
    sessionId,
    question: 'blood kya hai',
  });

  assert(doubt.status === 'answered', 'Side doubt during lesson should be answered when context exists.');
  assertCompactSources(doubt.sources, 'Side doubt answer');

  const followUp = await askInSession({
    sessionId,
    question: 'iska function kya hai',
  });

  assert(followUp.status === 'answered', 'Follow-up doubt should resolve using previous context.');
  assert(followUp.resolvedQuestion !== followUp.normalizedQuestion, 'Follow-up should include resolved context.');
  assertIncludes(
    followUp.resolvedQuestion,
    'blood',
    'Follow-up should use the last grounded doubt topic, not the active lesson topic.'
  );

  const state = await getChatState(sessionId);
  assert(
    state.currentChapterId === 'science.biology.chapter-01',
    'Follow-up doubt should not clear the active Biology lesson.'
  );
  assert(
    state.lastDoubtTopic === 'blood',
    'Answered side doubt should be saved separately from the active lesson topic.'
  );
  assert(
    state.lastTopic !== 'blood',
    'Active lesson topic should not be overwritten by a side doubt topic.'
  );

  return sessionId;
};

const runAmbiguousChapterConversation = async () => {
  const response = await askQuestion({
    question: 'chapter 2 padhao',
    studyMode: 'global',
  });

  assert(
    response.status === 'needs_clarification',
    'Ambiguous chapter number without a saved section should ask for clarification.'
  );
  assertIncludes(
    response.answer,
    'biology chapter 2',
    'Ambiguous chapter clarification should ask for section plus chapter number.'
  );

  return response.session.sessionId;
};

const runSubjectChangeDuringLessonConversation = async () => {
  const lesson = await askQuestion({
    question: 'chemistry chapter 4 padhao',
    studyMode: 'global',
  });
  const sessionId = lesson.session.sessionId;

  assert(lesson.status === 'lesson_started', 'Chemistry lesson should start.');

  const target = await askInSession({
    sessionId,
    question: 'biology padhna hai',
  });

  assert(target.status === 'learning_target_set', 'Subject change during lesson should set new learning target.');

  const state = await getChatState(sessionId);
  assert(state.currentSectionId === 'biology', 'Subject change should save Biology as current section.');
  assert(state.currentChapterId === null, 'Subject change should clear previous lesson chapter.');
  assert(state.pendingAction === 'choose_chapter', 'Subject change should wait for chapter selection.');

  return sessionId;
};

const runOutOfScopeDuringLessonConversation = async () => {
  const lesson = await askQuestion({
    question: 'physics chapter 3 padhao',
    studyMode: 'global',
  });
  const sessionId = lesson.session.sessionId;

  assert(lesson.status === 'lesson_started', 'Physics lesson should start.');

  const outOfScope = await askInSession({
    sessionId,
    question: 'cricket score kya hai',
  });

  assert(
    outOfScope.status === 'global_context_not_found',
    'Out-of-scope question during lesson should use no-context fallback.'
  );

  const state = await getChatState(sessionId);
  assert(
    state.currentChapterId === 'science.physics.chapter-03',
    'Out-of-scope question should preserve active lesson chapter.'
  );
  assert(state.learningMode === 'lesson', 'Out-of-scope question should preserve lesson mode.');

  return sessionId;
};

const runToughChapterGuardrailConversation = async () => {
  const response = await askQuestion({
    question: 'biology me kaun sa chapter tough hai',
    studyMode: 'global',
  });

  assert(
    response.status === 'study_advice_guardrail',
    'Difficulty-ranking question should use study advice guardrail.'
  );
  assertIncludes(
    response.answer,
    'difficulty ranking nahi di gayi',
    'Tough chapter answer should not guess a difficulty ranking.'
  );
  assert(response.sources.length === 0, 'Difficulty guardrail should not attach invented sources.');

  return response.session.sessionId;
};

const sessionIds = [];

try {
  await connectDB();

  sessionIds.push(await runChemistryLessonConversation());
  sessionIds.push(await runMetadataConversation());
  sessionIds.push(await runDoubtConversation());
  sessionIds.push(await runBiologyChapterNumberConversation());
  sessionIds.push(await runFocusOutOfChapterConversation());
  sessionIds.push(await runFollowUpDoubtConversation());
  sessionIds.push(await runAmbiguousChapterConversation());
  sessionIds.push(await runSubjectChangeDuringLessonConversation());
  sessionIds.push(await runOutOfScopeDuringLessonConversation());
  sessionIds.push(await runToughChapterGuardrailConversation());

  console.log('Tutor conversation tests passed.');
  console.log(JSON.stringify({
    conversations: 10,
    checked: [
      'greeting',
      'subject-only study intent',
      'chapter follow-up lesson start',
      'next lesson topic',
      'side doubt does not clear lesson state',
      'metadata chapter count',
      'grounded doubt answer',
      'biology chapter-number follow-up',
      'focus mode out-of-chapter refusal',
      'follow-up doubt context resolution',
      'ambiguous chapter clarification',
      'subject change during lesson',
      'out-of-scope during lesson state stability',
      'tough chapter guardrail',
    ],
  }, null, 2));
} catch (error) {
  console.error(`Tutor conversation tests failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanupSessions(sessionIds);
  await disconnectDB();
}
