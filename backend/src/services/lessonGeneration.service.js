import { createLessonChain } from '../rag/query/chains/lessonChain.js';
import {
  INSUFFICIENT_LESSON_CONTEXT_ANSWER,
} from '../rag/query/prompts/lessonPrompt.js';
import { retrieveRelevantChunks } from '../rag/query/retriever/retriever.js';
import { formatSources } from '../rag/query/answer/answerService.js';

const cleanText = (value) =>
  String(value || '').replace(/\s+/g, ' ').trim();

const cleanTopicTitle = (title) =>
  String(title || '')
    .replace(/^\d+\.\s*/, '')
    .trim();

const stripChunkContextHeader = (text) =>
  String(text || '')
    .replace(/\[Context\][\s\S]*?\[Content\]/, '')
    .replace(/[#*_`|>-]/g, ' ')
    .trim();

const getChunkText = (chunk) =>
  cleanText(stripChunkContextHeader(chunk.metadata?.originalText || chunk.content));

const createLessonSearchQuery = ({ chapter, topic }) =>
  [
    chapter.title,
    cleanTopicTitle(topic.title),
    topic.headingPath,
    ...(topic.ragHints || []),
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(' ');

const createChapterFilter = (chapter) => ({
  subject: chapter.subjectTitle,
  section: chapter.sectionTitle,
  chapter_no: chapter.number,
});

const formatLessonContext = (chunks) =>
  chunks.map((chunk, index) => {
    const metadata = chunk.metadata || {};

    return `[Source ${index + 1}]
Chapter: ${metadata.chapter_title || 'Unknown'}
Heading: ${metadata.heading_path || 'Unknown'}
Chunk ID: ${metadata.chunk_id || chunk.id || 'Unknown'}
Content:
${getChunkText(chunk)}`;
  }).join('\n\n---\n\n');

const createExtractiveLesson = ({ chapter, topic, chunks }) => {
  const snippets = chunks
    .map(getChunkText)
    .filter(Boolean)
    .slice(0, 3);

  if (!snippets.length) {
    return INSUFFICIENT_LESSON_CONTEXT_ANSWER;
  }

  return [
    `${chapter.sectionTitle} chapter ${chapter.number}: ${chapter.title}`,
    '',
    `Topic: ${cleanTopicTitle(topic.title)}`,
    '',
    'Available study material ke according:',
    '',
    ...snippets.map((snippet) => `- ${snippet}`),
  ].join('\n');
};

export const generateLessonFromTopic = async ({ chapter, topic, chain, retrieverOptions = {} }) => {
  const query = createLessonSearchQuery({ chapter, topic });
  const retrieval = await retrieveRelevantChunks(query, {
    topK: 4,
    metadataFilter: createChapterFilter(chapter),
    ...retrieverOptions,
  });
  const sources = formatSources(retrieval.results);

  if (!retrieval.results.length) {
    return {
      answer: INSUFFICIENT_LESSON_CONTEXT_ANSWER,
      sources: [],
      retrieval,
      generationMode: 'no_context_fallback',
    };
  }

  const lessonChain = chain || createLessonChain();

  try {
    const answer = await lessonChain.invoke({
      chapterTitle: chapter.title,
      topicTitle: cleanTopicTitle(topic.title),
      context: formatLessonContext(retrieval.results),
    });

    return {
      answer,
      sources,
      retrieval,
      generationMode: 'llm',
    };
  } catch (error) {
    return {
      answer: createExtractiveLesson({ chapter, topic, chunks: retrieval.results }),
      sources,
      retrieval,
      generationMode: 'extractive_fallback',
      modelError: error.message,
    };
  }
};
