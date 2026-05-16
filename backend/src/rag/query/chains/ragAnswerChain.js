import { RunnableSequence } from '@langchain/core/runnables';

import { createChatModel } from '../llm/chatModel.js';
import { stringParser } from '../parsers/stringParser.js';
import { tutorPrompt } from '../prompts/tutorPrompt.js';

export const createRagAnswerChain = (options = {}) =>
  RunnableSequence.from([
    tutorPrompt,
    options.chatModel || createChatModel(options.llmConfig),
    stringParser,
  ]);
