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

  if (fallbackName && !process.env[name] && process.env[fallbackName]) {
    process.env[name] = process.env[fallbackName];
  }

  return value;
};

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
    });
  }

  if (config.provider === LLM_PROVIDERS.openai) {
    return new ChatOpenAI({
      apiKey: getRequiredEnv('OPENAI_API_KEY'),
      model: config.model,
      temperature: config.temperature,
    });
  }

  return new ChatGoogleGenerativeAI({
    apiKey: getRequiredEnv('GOOGLE_API_KEY', 'GEMINI_API_KEY'),
    model: config.model,
    temperature: config.temperature,
  });
};

