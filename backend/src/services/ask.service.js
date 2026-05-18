import { generateRagAnswer } from '../rag/query/answer/answerService.js';
import { INSUFFICIENT_CONTEXT_ANSWER } from '../rag/query/prompts/tutorPrompt.js';
import { detectQuestionLanguage } from '../utils/languageDetector.js';
import ApiError from '../utils/ApiError.js';
import { findStudyMapChapter } from './studyMap.service.js';

const STUDY_MODES = {
  global: 'global',
  focus: 'focus',
};

const STATUS = {
  answered: 'answered',
  focusContextNotFound: 'focus_context_not_found',
  globalContextNotFound: 'global_context_not_found',
};

const FOCUS_CONTEXT_NOT_FOUND_ANSWER =
  'Mere paas selected chapter ke provided context me is question ka enough information nahi hai. Aap chaho to Global Mode me search kar sakte ho.';

const GLOBAL_CONTEXT_NOT_FOUND_ANSWER =
  'Mere paas provided Science content me is question ka enough information nahi hai.';

const FOCUS_CONTEXT_NOT_FOUND_ENGLISH_ANSWER =
  'I do not have enough information in the selected chapter context to answer this. You can search in Global Mode if you want.';

const GLOBAL_CONTEXT_NOT_FOUND_ENGLISH_ANSWER =
  'I do not have enough information in the provided Science content to answer this.';

const normalizeText = (value) => String(value || '').trim();

const validateStudyMode = (studyMode) => {
  if (!Object.values(STUDY_MODES).includes(studyMode)) {
    throw new ApiError(400, 'studyMode must be either "global" or "focus".');
  }
};

const validateGlobalRequest = (body) => {
  if (body.chapterId) {
    throw new ApiError(400, 'chapterId is allowed only when studyMode is "focus".');
  }
};

const validateFocusRequest = async (body) => {
  const chapterId = normalizeText(body.chapterId);

  if (!chapterId) {
    throw new ApiError(400, 'chapterId is required when studyMode is "focus".');
  }

  const chapter = await findStudyMapChapter(chapterId);

  if (!chapter) {
    throw new ApiError(404, `Chapter not found for chapterId: ${chapterId}`);
  }

  return chapter;
};

const isContextNotFoundAnswer = (answer) =>
  normalizeText(answer) === INSUFFICIENT_CONTEXT_ANSWER;

const getSuggestedActions = (status) => {
  if (status !== STATUS.focusContextNotFound) {
    return [];
  }

  return [
    {
      type: 'switch_to_global',
      label: 'Switch to Global Mode',
    },
    {
      type: 'cancel',
      label: 'Cancel',
    },
  ];
};

const getScope = ({ studyMode, chapter }) => {
  if (studyMode === STUDY_MODES.global) {
    return null;
  }

  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    sectionId: chapter.sectionId,
    sectionTitle: chapter.sectionTitle,
    subjectId: chapter.subjectId,
    subjectTitle: chapter.subjectTitle,
  };
};

const formatApiSources = (sources) =>
  sources.map((source) => ({
    sourceNumber: source.sourceNumber,
    chapterTitle: source.chapterTitle || source.chapter_title,
    section: source.section,
    headingPath: source.headingPath || source.heading_path,
    chunkId: source.chunkId || source.chunk_id,
  }));

const getStatus = ({ studyMode, result }) => {
  if (result.retrieval.results.length > 0 && !isContextNotFoundAnswer(result.answer)) {
    return STATUS.answered;
  }

  return studyMode === STUDY_MODES.focus
    ? STATUS.focusContextNotFound
    : STATUS.globalContextNotFound;
};

const getAnswer = ({ status, result, answerLanguage }) => {
  if (status === STATUS.focusContextNotFound) {
    return answerLanguage === 'english'
      ? FOCUS_CONTEXT_NOT_FOUND_ENGLISH_ANSWER
      : FOCUS_CONTEXT_NOT_FOUND_ANSWER;
  }

  if (status === STATUS.globalContextNotFound) {
    return answerLanguage === 'english'
      ? GLOBAL_CONTEXT_NOT_FOUND_ENGLISH_ANSWER
      : GLOBAL_CONTEXT_NOT_FOUND_ANSWER;
  }

  return result.answer;
};

export const askQuestion = async (body = {}) => {
  const question = normalizeText(body.question);
  const studyMode = normalizeText(body.studyMode);

  if (!question) {
    throw new ApiError(400, 'question is required.');
  }

  validateStudyMode(studyMode);

  let chapter = null;
  let retrieverOptions = {};

  if (studyMode === STUDY_MODES.global) {
    validateGlobalRequest(body);
  } else {
    chapter = await validateFocusRequest(body);
    retrieverOptions = {
      metadataFilter: chapter.metadataFilter,
    };
  }

  const language = detectQuestionLanguage(question);
  const result = await generateRagAnswer(question, {
    answerLanguage: language.answerLanguage,
    retrieverOptions,
  });
  const status = getStatus({ studyMode, result });
  const answer = getAnswer({ status, result, answerLanguage: language.answerLanguage });

  return {
    status,
    studyMode,
    question,
    detectedLanguage: language.detectedLanguage,
    answerLanguage: language.answerLanguage,
    answer,
    sources: status === STATUS.answered ? formatApiSources(result.sources) : [],
    suggestedActions: getSuggestedActions(status),
    scope: getScope({ studyMode, chapter }),
  };
};
