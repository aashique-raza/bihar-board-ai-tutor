import { RunnableSequence } from '@langchain/core/runnables';

import { createChatModel } from '../llm/chatModel.js';
import { stringParser } from '../parsers/stringParser.js';
import { lessonPrompt } from '../prompts/lessonPrompt.js';

export const createLessonChain = (options = {}) =>
  RunnableSequence.from([
    lessonPrompt,
    options.chatModel || createChatModel(options.llmConfig),
    stringParser,
  ]);
