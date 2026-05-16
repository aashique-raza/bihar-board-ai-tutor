import { retrieveRelevantChunks } from '../retriever/retriever.js';
import { createRagAnswerChain } from '../chains/ragAnswerChain.js';
import { INSUFFICIENT_CONTEXT_ANSWER } from '../prompts/tutorPrompt.js';

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

export const formatSources = (chunks) =>
  chunks.map((chunk, index) => {
    const metadata = chunk.metadata || {};

    return {
      sourceNumber: index + 1,
      chapter_title: metadata.chapter_title || 'Unknown',
      heading_path: metadata.heading_path || 'Unknown',
      chunk_id: metadata.chunk_id || chunk.id || 'Unknown',
    };
  });

export const formatSourcesText = (sources) =>
  sources
    .map((source) =>
      `${source.sourceNumber}. ${source.chapter_title} | ${source.heading_path} | ${source.chunk_id}`
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
  const chain = options.chain || createRagAnswerChain({
    chatModel: options.chatModel,
    llmConfig: options.llmConfig,
  });
  try {
    const rawAnswer = await chain.invoke({
      question: query,
      context: formatContext(retrieval.results),
    });
    const answer = removeRepeatedQuestionOpening(rawAnswer, query);

    return {
      question: query,
      answer,
      answerWithSources: appendSourcesToAnswer({ answer, sources }),
      sources,
      retrieval,
      generationMode: 'llm',
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
