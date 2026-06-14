/**
 * chatModel.js
 *
 * Factory function that creates the LLM chat model.
 * The actual provider (Groq, OpenAI, or Google Gemini) is chosen
 * based on the LLM_PROVIDER environment variable.
 *
 * Usage:
 *   import { createChatModel } from '../llm/chatModel.js';
 *   const model = createChatModel();
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';

import { getLlmConfig, LLM_PROVIDERS } from './llm.config.js';

const getRequiredEnv = (name, fallbackName) => {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);

  if (!value) {
    throw new Error(
      `${name}${fallbackName ? ` or ${fallbackName}` : ''} is required for the selected LLM provider.`
    );
  }

  // Copy fallback key to the primary key so LangChain finds it
  if (fallbackName && !process.env[name] && process.env[fallbackName]) {
    process.env[name] = process.env[fallbackName];
  }

  return value;
};

/**
 * Creates and returns a LangChain chat model instance.
 * Pass optional overrides to change provider/model/temperature at call time.
 */
export const createChatModel = (overrides = {}) => {
  const config = {
    ...getLlmConfig(),
    ...overrides,
  };

  if (config.provider === LLM_PROVIDERS.groq) {
    return new ChatGroq({
      apiKey: getRequiredEnv('GROQ_API_KEY'),
      model: config.model,
      temperature: config.temperature,
      maxRetries: 0, // Pipeline handles errors — LangChain retry hides rate limits for 60s
    });
  }

  if (config.provider === LLM_PROVIDERS.openai) {
    return new ChatOpenAI({
      apiKey: getRequiredEnv('OPENAI_API_KEY'),
      model: config.model,
      temperature: config.temperature,
      maxRetries: 0,
    });
  }

  // Default: Google Gemini
  return new ChatGoogleGenerativeAI({
    apiKey: getRequiredEnv('GOOGLE_API_KEY', 'GEMINI_API_KEY'),
    model: config.model,
    temperature: config.temperature,
    maxRetries: 0,
  });
};
