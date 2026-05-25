/**
 * promptHelpers.js
 *
 * Shared text formatting helpers used when building LLM prompts.
 * Used by Step 3 (build context) and Step 6 (generate response).
 *
 * FUNCTIONS:
 *   formatRecentHistory(messages)       → converts DB messages to "Student: ... / Zuno: ..." text
 *   getLastTutorResponse(messages)      → gets the last thing Zuno said
 *   formatStudyMapSummary(studyMap)     → formats available chapters as a readable summary
 *   formatMemoryForPrompt(chatState)    → picks relevant fields from chatState for the prompt
 *   formatRetrievedContext(chunks)      → formats RAG chunks as "[Source N] ..." blocks
 *   sectionsToAnswerText({ title, sections }) → converts sections to a plain text answer
 */

export const compactText = (value) =>
  String(value || '').replace(/\s+/g, ' ').trim();

/**
 * Formats recent DB messages as a readable conversation block for LLM prompts.
 * Example output: "Student: photosynthesis kya hai\nZuno: Photosynthesis ek process hai..."
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
 * Returns the last Zuno message from recent history as a plain string.
 * Used to help the LLM avoid repeating itself.
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
 * Formats the study map (available chapters) as a plain text curriculum summary.
 * Example:
 *   Physics
 *   1. Electricity; 2. Magnetic Effects...
 *
 *   Chemistry
 *   1. Chemical Reactions; ...
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
 * Extracts the relevant fields from the chatState for use in LLM prompts.
 * Converts undefined fields to null/defaults so the prompt is always valid.
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
 * Formats RAG chunks as a labeled context block for the Tutor LLM prompt.
 * Returns 'NO_RETRIEVED_CONTEXT' if no chunks are available.
 *
 * Example output:
 *   [Source 1]
 *   Chapter: Life Processes
 *   Heading: Nutrition
 *   Content: ...
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
 * Converts a structured { title, sections } response into a plain text answer string.
 * This is used for storing the tutor's reply in chat history (plain text format).
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
