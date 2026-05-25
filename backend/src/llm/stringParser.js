/**
 * stringParser.js
 *
 * A simple LangChain string output parser.
 * Used at the end of every LangChain chain to convert the
 * model's AIMessage output into a plain JavaScript string.
 *
 * Usage:
 *   import { stringParser } from '../llm/stringParser.js';
 *   const chain = RunnableSequence.from([prompt, model, stringParser]);
 */

import { StringOutputParser } from '@langchain/core/output_parsers';

export const stringParser = new StringOutputParser();
