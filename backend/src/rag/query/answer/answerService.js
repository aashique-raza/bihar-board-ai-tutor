import { retrieveRelevantChunks } from '../retriever/retriever.js';
import { createRagAnswerChain } from '../chains/ragAnswerChain.js';
import { INSUFFICIENT_CONTEXT_ANSWER } from '../prompts/tutorPrompt.js';
import { getAnswerLanguageInstruction } from '../../../utils/languageDetector.js';

const cleanText = (text) =>
  String(text || '').replace(/\s+/g, ' ').trim();

const normalizeForComparison = (text) =>
  cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const removeRepeatedQuestionOpening = (answer, question) => {
  const lines = String(answer || '').split(/\r?\n/);
  const normalizedQuestion = normalizeForComparison(question);
  const firstContentIndex = lines.findIndex((line) => line.trim());

  if (firstContentIndex === -1 || !normalizedQuestion) {
    return answer;
  }

  const firstLine = lines[firstContentIndex].trim().replace(/[:?।.]+$/, '');
  const normalizedFirstLine = normalizeForComparison(firstLine);

  if (normalizedFirstLine === normalizedQuestion) {
    return [
      ...lines.slice(0, firstContentIndex),
      ...lines.slice(firstContentIndex + 1),
    ].join('\n').trim();
  }

  return answer;
};

const stripContextPrefix = (text) =>
  cleanText(text)
    .replace(/\[Context\][\s\S]*?\[Content\]/, '')
    .replace(/[#*_`|>-]/g, ' ')
    .trim();

const isBareQuestionLine = (text) =>
  /^\d+\.?\s*(what|why|how|explain|define|describe|write)\b/i.test(text) ||
  /\?$/.test(text.trim());

const getHeadingParts = (headingPath) =>
  String(headingPath || '')
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean);

const cleanTopicTitle = (headingPath, chapterTitle) => {
  const parts = getHeadingParts(headingPath);
  const leaf = parts[parts.length - 1] || chapterTitle || 'Unknown topic';

  return leaf
    .replace(/^chapter\s+\d+\s*:\s*/i, '')
    .replace(/^\d+\.?\s*/, '')
    .trim() || 'Unknown topic';
};

const createSourceKey = ({ chapterTitle, headingPath }) =>
  `${normalizeForComparison(chapterTitle)}::${normalizeForComparison(headingPath)}`;

const createSourceLabel = ({ chapterTitle, topicTitle }) =>
  topicTitle && topicTitle !== chapterTitle
    ? `${chapterTitle} - ${topicTitle}`
    : chapterTitle;

export const formatSources = (chunks) =>
  chunks.reduce((sources, chunk) => {
    const metadata = chunk.metadata || {};
    const chapterTitle = metadata.chapter_title || 'Unknown';
    const headingPath = metadata.heading_path || 'Unknown';
    const topicTitle = cleanTopicTitle(headingPath, chapterTitle);
    const chunkId = metadata.chunk_id || chunk.id || 'Unknown';
    const key = createSourceKey({ chapterTitle, headingPath });
    const existingSource = sources.find((source) => source.sourceId === key);

    if (existingSource) {
      existingSource.chunkIds = [...new Set([...existingSource.chunkIds, chunkId])];
      return sources;
    }

    const sourceNumber = sources.length + 1;
    const source = {
      sourceNumber,
      sourceId: key,
      label: `Source ${sourceNumber}: ${createSourceLabel({ chapterTitle, topicTitle })}`,
      sourceTitle: createSourceLabel({ chapterTitle, topicTitle }),
      chapter_title: chapterTitle,
      chapterTitle,
      topicTitle,
      section: metadata.section || 'Unknown',
      sectionTitle: metadata.section || 'Unknown',
      heading_path: headingPath,
      headingPath,
      chunk_id: chunkId,
      chunkId,
      chunkIds: [chunkId],
    };

    return [...sources, source];
  }, []);

export const formatSourcesText = (sources) =>
  sources
    .map((source) =>
      `${source.sourceNumber}. ${source.sourceTitle || source.chapter_title} | ${source.heading_path} | ${(source.chunkIds || [source.chunk_id]).join(', ')}`
    )
    .join('\n');

const appendSourcesToAnswer = ({ answer, sources }) => {
  if (!sources.length) {
    return answer;
  }

  return `${answer.trim()}

Sources:
${formatSourcesText(sources)}`;
};

const formatContext = (chunks) =>
  chunks.map((chunk, index) => {
    const metadata = chunk.metadata || {};
    const content = cleanText(metadata.originalText || chunk.content);

    return `[Source ${index + 1}]
Chapter: ${metadata.chapter_title || 'Unknown'}
Heading: ${metadata.heading_path || 'Unknown'}
Chunk ID: ${metadata.chunk_id || chunk.id || 'Unknown'}
Content:
${content}`;
  }).join('\n\n---\n\n');

const createNoContextAnswer = (question, retrieval) => ({
  question,
  answer: INSUFFICIENT_CONTEXT_ANSWER,
  answerWithSources: INSUFFICIENT_CONTEXT_ANSWER,
  sources: [],
  retrieval,
  generationMode: 'no_context_fallback',
});

const shouldUseExtractiveOnly = () =>
  process.env.RAG_EXTRACTIVE_ONLY === 'true';

const createExtractiveFallbackAnswer = (chunks) => {
  const snippets = chunks
    .map((chunk) => stripContextPrefix(chunk.metadata?.originalText || chunk.content))
    .filter(Boolean)
    .slice(0, 3)
    .map((text) => {
      const sentences = text.match(/[^.!?]+[.!?]/g) || [text];

      return sentences
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence && !isBareQuestionLine(sentence))
        .slice(0, 2)
        .join(' ')
        .trim();
    })
    .filter(Boolean);

  if (!snippets.length) {
    return INSUFFICIENT_CONTEXT_ANSWER;
  }

  return `Provided context ke according:\n\n${snippets
    .map((snippet) => `- ${snippet}`)
    .join('\n')}`;
};

export const generateRagAnswer = async (question, options = {}) => {
  const query = String(question || '').trim();

  if (!query) {
    throw new Error('Question cannot be empty.');
  }

  const retrieval = await retrieveRelevantChunks(query, options.retrieverOptions || {});

  if (!retrieval.results.length) {
    return createNoContextAnswer(query, retrieval);
  }

  const sources = formatSources(retrieval.results);

  if (shouldUseExtractiveOnly()) {
    const answer = createExtractiveFallbackAnswer(retrieval.results);

    return {
      question: query,
      answer,
      answerWithSources: appendSourcesToAnswer({ answer, sources }),
      sources,
      retrieval,
      generationMode: 'extractive_only',
    };
  }

  const chain = options.chain || createRagAnswerChain({
    chatModel: options.chatModel,
    llmConfig: options.llmConfig,
  });
  try {
    const rawAnswer = await chain.invoke({
      question: query,
      answerLanguageInstruction: getAnswerLanguageInstruction(options.answerLanguage),
      context: formatContext(retrieval.results),
    });
    const answer = removeRepeatedQuestionOpening(rawAnswer, query);
    const finalAnswer =
      normalizeForComparison(answer) === normalizeForComparison(INSUFFICIENT_CONTEXT_ANSWER)
        ? createExtractiveFallbackAnswer(retrieval.results)
        : answer;

    return {
      question: query,
      answer: finalAnswer,
      answerWithSources: appendSourcesToAnswer({ answer: finalAnswer, sources }),
      sources,
      retrieval,
      generationMode: finalAnswer === answer ? 'llm' : 'extractive_fallback',
    };
  } catch (error) {
    if (options.throwOnModelError) {
      throw error;
    }

    const answer = createExtractiveFallbackAnswer(retrieval.results);

    return {
      question: query,
      answer,
      answerWithSources: appendSourcesToAnswer({ answer, sources }),
      sources,
      retrieval,
      generationMode: 'extractive_fallback',
      modelError: error.message,
    };
  }
};
