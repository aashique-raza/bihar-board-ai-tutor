export const compactText = (value) =>
  String(value || '').replace(/\s+/g, ' ').trim();

/**
 * Formats DB chat logs into plain text conversation lines for the prompt.
 * Used by: legacy step6 path, EXPLAIN_MORE intent (needs full Zuno responses
 * for variation mandate), and as a fallback inside formatCompressedHistory.
 */
export const formatRecentHistory = (messages = []) => {
  if (!messages.length) {
    return 'No previous messages in this session.';
  }

  return messages
    .map((message) => `${message.role === 'student' ? 'Student' : 'Zuno'}: ${compactText(message.text)}`)
    .join('\n');
};

// Shrinks an older Zuno response to its first 30 words + word count.
// The "Zuno [prev, ~Nw]:" prefix is visually distinct from "Zuno:" so
// intent prompts' "check the most recent Zuno: entry" instruction
// unambiguously targets the one full entry at the bottom of history.
const compressZunoResponse = (text) => {
  const words = text.split(/\s+/);
  const preview = words.slice(0, 30).join(' ');
  const suffix = words.length > 30 ? '...' : '';
  return `Zuno [prev, ~${words.length}w]: ${preview}${suffix}`;
};

/**
 * History formatter with token-efficient compression.
 *
 * The LAST Zuno entry is always kept full because:
 *   - CONCEPT_QUESTION: anti-repetition rule checks "most recent Zuno: entry"
 *   - GREETING: meta-reaction handling needs the exact previous reply
 * All OLDER Zuno entries are compressed to first 30 words + word count.
 * Student messages are NEVER compressed — they carry intent and are short.
 *
 * Use for:     GREETING, CHOOSE_COURSE, CONCEPT_QUESTION, NEXT_STEP, deciderHistory
 * Do NOT use for: EXPLAIN_MORE (variation mandate requires full last response)
 */
export const formatCompressedHistory = (messages = []) => {
  if (!messages.length) return 'No previous messages in this session.';

  // Find the last Zuno message index — this one stays full
  let lastZunoIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'tutor') { lastZunoIdx = i; break; }
  }

  // No Zuno message in window yet — nothing to compress, use full format
  if (lastZunoIdx < 0) return formatRecentHistory(messages);

  return messages
    .map((msg, idx) => {
      const text = compactText(msg.text);
      if (msg.role === 'student') return `Student: ${text}`;  // never compress
      if (idx === lastZunoIdx)    return `Zuno: ${text}`;     // last entry — full
      return compressZunoResponse(text);                       // older entries — compressed
    })
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
  learningMode: chatState?.learningMode || 'idle',
  pendingAction: chatState?.pendingAction || null,
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
    const headingPath = String(metadata.heading_path || '');
    const leafHeading = (headingPath.split('>').pop() || 'Unknown').trim();

    return `[Source ${index + 1}]
Chapter: ${metadata.chapter_title || 'Unknown'}
Heading: ${leafHeading}
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