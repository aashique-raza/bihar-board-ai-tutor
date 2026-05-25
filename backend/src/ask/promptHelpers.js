export const compactText = (value) =>
  String(value || '').replace(/\s+/g, ' ').trim();

/**
 * DB chat logs ko conversation blocks me text-format karta hai.
 */
export const formatRecentHistory = (messages = []) => {
  if (!messages.length) {
    return 'No previous messages in this session.';
  }

  return messages
    .map((message) => `${message.role === 'student' ? 'Student' : 'Zuno'}: ${compactText(message.text)}`)
    .join('\n');
};

/**
 * Repetition checks ko bypass karne ke liye tutor ka pichla turn response nikalta hai.
 */
export const getLastTutorResponse = (messages = []) => {
  const lastTutorMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'tutor');

  return lastTutorMessage
    ? compactText(lastTutorMessage.text)
    : 'No previous Zuno response.';
};

/**
 * Available chapters list ko generic presentation summary me format karta hai.
 */
export const formatStudyMapSummary = (studyMap) => {
  const subjects = studyMap?.focusStudy?.subjects || [];

  if (!subjects.length) {
    return 'No curriculum map is available.';
  }

  return subjects.map((subject) => {
    const sections = (subject.sections || []).map((section) => {
      const chapters = (section.chapters || [])
        .map((chapter) => `${chapter.number}. ${chapter.title}`)
        .join('; ');
      return `${section.title}: ${chapters}`;
    });

    return `${subject.title}\n${sections.join('\n')}`;
  }).join('\n\n');
};

/**
 * State records fields mapping rules definitions.
 */
export const formatMemoryForPrompt = (chatState) => ({
  currentSubjectId: chatState?.currentSubjectId || null,
  currentSectionId: chatState?.currentSectionId || null,
  currentChapterId: chatState?.currentChapterId || null,
  currentTopicId: chatState?.currentTopicId || null,
  learningMode: chatState?.learningMode || 'idle',
  pendingAction: chatState?.pendingAction || null,
  completedTopicIds: chatState?.completedTopicIds || [],
  lastTopic: chatState?.lastTopic || null,
  lastDoubtTopic: chatState?.lastDoubtTopic || null,
  lastDoubtQuestion: chatState?.lastDoubtQuestion || null,
});

/**
 * RAG nodes lists processing module block string assembler.
 */
export const formatRetrievedContext = (chunks = []) => {
  if (!chunks.length) {
    return 'NO_RETRIEVED_CONTEXT';
  }

  return chunks.map((chunk, index) => {
    const metadata = chunk.metadata || {};
    const content = compactText(metadata.originalText || chunk.content);

    return `[Source ${index + 1}]
Chapter: ${metadata.chapter_title || 'Unknown'}
Heading: ${metadata.heading_path || 'Unknown'}
Chunk ID: ${metadata.chunk_id || chunk.id || 'Unknown'}
Content:
${content}`;
  }).join('\n\n---\n\n');
};

/**
 * Multi blocks elements strings mapping utility.
 */
export const sectionsToAnswerText = ({ title, sections = [] }) => {
  const parts = [];
  const normalizedTitle = compactText(title);

  if (normalizedTitle) {
    parts.push(normalizedTitle);
  }

  for (const section of sections) {
    const heading = compactText(section.heading);
    const content = compactText(section.content);
    const headingRepeatsTitle =
      normalizedTitle &&
      heading.toLowerCase() === normalizedTitle.toLowerCase();

    if (heading && content && !headingRepeatsTitle) {
      parts.push(`${heading}\n${content}`);
    } else if (content) {
      parts.push(content);
    }
  }

  return parts.join('\n\n').trim();
};