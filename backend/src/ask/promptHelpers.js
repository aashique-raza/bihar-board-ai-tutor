export const compactText = (value) =>
  String(value || '').replace(/\s+/g, ' ').trim();

/**
 * Formats DB chat logs into plain text conversation lines for the prompt.
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
 * Returns the tutor's previous reply (used for repetition checks).
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
 * Formats the available chapters list into a short summary for the prompt.
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
  completedTopicsCount: (chatState?.completedTopicIds || []).length,
  lastTopic: chatState?.lastTopic || null,
  lastDoubtTopic: chatState?.lastDoubtTopic || null,
  lastDoubtQuestion: chatState?.lastDoubtQuestion || null,
});

// Strips the [Context] header prepended by markdownChunker and returns only the
// actual educational text after the [Content] marker.
// Without this, every chunk sent to the LLM contains a duplicate metadata block
// (Board/Class/Subject/Chapter/Topic) that is already present in the [Source N] header.
const extractChunkContent = (chunk) => {
  const raw = chunk.content || '';
  const idx = raw.indexOf('[Content]');
  if (idx !== -1) return raw.slice(idx + '[Content]'.length).trim();
  return String(raw).replace(/\s+/g, ' ').trim();
};

/**
 * RAG nodes lists processing module block string assembler.
 */
export const formatRetrievedContext = (chunks = []) => {
  if (!chunks.length) {
    return 'NO_RETRIEVED_CONTEXT';
  }

  return chunks.map((chunk, index) => {
    const metadata = chunk.metadata || {};
    const content = extractChunkContent(chunk);

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