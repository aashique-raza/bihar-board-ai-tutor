/**
 * llm.config.js
 *
 * LLM provider configuration.
 * Supports: Groq, OpenAI, Google Gemini.
 * Provider is selected via LLM_PROVIDER env variable (default: groq).
 */

export const LLM_PROVIDERS = {
  groq: 'groq',
  openai: 'openai',
  google: 'google',
};

// Default model for each provider
const DEFAULT_MODELS = {
  [LLM_PROVIDERS.groq]: 'llama-3.3-70b-versatile',
  [LLM_PROVIDERS.openai]: 'gpt-4o-mini',
  [LLM_PROVIDERS.google]: 'gemini-2.0-flash',
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Returns the active LLM configuration based on environment variables.
 * LLM_PROVIDER, LLM_MODEL, LLM_TEMPERATURE can all be overridden via .env
 */
export const getLlmConfig = () => {
  const provider = (process.env.LLM_PROVIDER || LLM_PROVIDERS.groq).toLowerCase();

  if (!Object.values(LLM_PROVIDERS).includes(provider)) {
    throw new Error(
      `Unsupported LLM_PROVIDER "${provider}". Use one of: groq, openai, google.`
    );
  }

  return {
    provider,
    model: process.env.LLM_MODEL || DEFAULT_MODELS[provider],
    temperature: toNumber(process.env.LLM_TEMPERATURE, 0),
  };
};

/**
 * Returns config specifically for the decider (intent classifier) LLM call.
 * If DECIDER_PROVIDER / DECIDER_MODEL are set in .env, those are used.
 * Otherwise falls back to the global LLM_PROVIDER / LLM_MODEL — no breaking change.
 *
 * This lets decider run on a smaller/cheaper model (e.g. Groq 8B) while
 * the tutor uses a larger model (e.g. OpenAI gpt-4o-mini), independently.
 */
export const getDeciderConfig = () => {
  const rawProvider = process.env.DECIDER_PROVIDER || process.env.LLM_PROVIDER || LLM_PROVIDERS.groq;
  const provider = rawProvider.toLowerCase();

  if (!Object.values(LLM_PROVIDERS).includes(provider)) {
    throw new Error(
      `Unsupported DECIDER_PROVIDER "${provider}". Use one of: groq, openai, google.`
    );
  }

  return {
    provider,
    model: process.env.DECIDER_MODEL || DEFAULT_MODELS[provider],
    temperature: toNumber(process.env.LLM_TEMPERATURE, 0),
  };
};
